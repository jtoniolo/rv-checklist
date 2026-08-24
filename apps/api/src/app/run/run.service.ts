import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChecklistRepository,
  LogEntryRepository,
  MaintenanceTaskRepository,
  ownedOrUndefined,
  RigRepository,
  RunRepository,
  TripRepository,
} from '@rv-checklist/api-data-access';
import {
  toLoggedFields,
  validateFieldValues,
  type Checklist,
  type CreateRunWithId,
  type Id,
  type LogEntry,
  type MaintenanceTask,
  type Run,
  type RunStep,
  type RunStepOp,
  type StepState,
  type Step,
  type Trip,
  type UpdateRun,
} from '@rv-checklist/domain';
import { Clock } from '../auth/clock.js';
import { adoptCreated } from '../common/adopt-created.js';

/**
 * Copy a checklist step into a fresh run step: it starts `incomplete`, with a new
 * id (a run's steps are its own, not the template's) and no captured values. A
 * task link and any plain-step `field_schema` ride across unchanged (ADR-0008),
 * so completing the step later can capture values against that schema.
 *
 * `editedAt` starts the step's own LWW clock (ADR-0030) at the run's create stamp, so the
 * very first operation on a step is already compared against something. Without it a stale
 * queued edit would win against an untouched step simply for arriving.
 */
function toRunStep(step: Step, editedAt: string): RunStep {
  return {
    id: randomUUID(),
    text: step.text,
    ...(step.taskId !== undefined && { taskId: step.taskId }),
    ...(step.fieldSchema !== undefined && { fieldSchema: step.fieldSchema }),
    state: 'incomplete',
    editedAt,
  };
}

/**
 * One step operation with its clock reading already resolved to a `Date` — absent stamps
 * filled in and future ones clamped, so the merge itself only ever compares instants.
 */
interface ResolvedStepOp {
  readonly stepId: Id;
  readonly state?: StepState | undefined;
  readonly values?: NonNullable<RunStep['values']> | undefined;
  /** The Log Entry the client says it authored for this completion — unverified here. */
  readonly logEntryId?: Id | undefined;
  /** The reading to compare the stored step against, and to stamp it with once applied. */
  readonly editedAt: Date;
  /**
   * Whether that reading came from a client rather than being the server's own "now". An
   * operation that carried no stamp at all is an authoritative online edit and always
   * applies — exactly what a bare `Repository.save` means at record level — so it is never
   * weighed against the step's clock. Only a client's reading has to win on merit.
   */
  readonly stamped: boolean;
}

/**
 * The reconciled outcome of a batch of step operations, planned before
 * anything is written: the steps to store, the Log Entries new completions
 * will write, and the entry ids un-completions detach (to delete).
 */
interface MaintenanceLogPlan {
  readonly steps: RunStep[];
  readonly entries: LogEntry[];
  readonly detachedEntryIds: Id[];
}

/** How many times a merge re-reads and replans after losing the compare-and-set. */
const MERGE_ATTEMPTS = 3;

/**
 * The step an operation leaves behind, built field by field rather than spread over the
 * previous one: `values` and `logEntryId` are decided elsewhere (an empty answer set is
 * stored as *absent*, and the entry link is resolved after the whole batch has settled),
 * so carrying them across implicitly is exactly the bug to avoid.
 */
function applyOp(base: RunStep, op: ResolvedStepOp): RunStep {
  const values = op.values ?? base.values;
  return {
    id: base.id,
    text: base.text,
    ...(base.taskId !== undefined && { taskId: base.taskId }),
    ...(base.fieldSchema !== undefined && { fieldSchema: base.fieldSchema }),
    state: op.state ?? base.state,
    ...(values !== undefined && values.length > 0 && { values }),
    editedAt: op.editedAt.toISOString(),
  };
}

/**
 * Whether an operation loses to what the step already holds. A client's reading has to be
 * **strictly** newer, so two devices that stamp the same instant settle on the one that
 * arrived first rather than flapping; an unstamped (authoritative) operation always wins.
 */
function isStale(step: RunStep, op: ResolvedStepOp): boolean {
  return (
    op.stamped &&
    step.editedAt !== undefined &&
    op.editedAt.getTime() <= Date.parse(step.editedAt)
  );
}

/** The Log Entry for one task-linked completion — built, not yet written. */
function buildEntry(
  task: MaintenanceTask,
  step: Omit<RunStep, 'logEntryId'>,
  performedOn: string,
): LogEntry {
  return {
    id: randomUUID(),
    taskId: task.id,
    rigId: task.rigId,
    // Snapshot the task's name at completion time (issue #27), alongside the
    // field snapshot — a later rename never rewrites this entry.
    taskName: task.name,
    performedOn,
    fields: toLoggedFields(task.fieldSchema, step.values),
  };
}

/**
 * Runs over plain checklists, owner-scoped (issue #16). Starting a run **copies**
 * the checklist's steps (story: a run is a dated copy), so a later edit to the
 * checklist never alters a past run — the copy is the guarantee, held here, not a
 * live reference. A run belongs to a rig (ADR-0006), so ownership (ADR-0003) is
 * enforced *via the rig*, exactly as {@link ChecklistService} does: every
 * operation resolves the run's (or checklist's) rig through
 * {@link ownedOrUndefined}, so one owner can never see, edit, or delete another's
 * run — a foreign id is indistinguishable from "not found".
 *
 * Nothing is locked (CONTEXT.md): marking steps complete/skipped/incomplete, capturing a
 * plain step's field values, or correcting a past answer are all the same kind of write and
 * freely reversible. Since ADR-0030 that write is a **step operation** merged by step id
 * rather than a swap of the whole array, because a whole-array write is exactly what erases
 * one device's completions when two of them work the same run offline; {@link update} still
 * accepts a full array and turns it into operations. It holds no HTTP or persistence
 * detail, depending only on the repository ports and a {@link Clock}, so the whole loop is
 * exercised with no database.
 */
@Injectable()
export class RunService {
  constructor(
    private readonly runs: RunRepository,
    private readonly checklists: ChecklistRepository,
    private readonly rigs: RigRepository,
    private readonly tasks: MaintenanceTaskRepository,
    private readonly logEntries: LogEntryRepository,
    private readonly trips: TripRepository,
    private readonly clock: Clock,
  ) {}

  /** Whether the rig exists and belongs to the owner — the single ownership gate. */
  private async ownsRig(ownerId: Id, rigId: Id): Promise<boolean> {
    return (
      ownedOrUndefined(await this.rigs.findById(rigId), ownerId) !== undefined
    );
  }

  /**
   * The checklist if the owner owns it (via its rig, ADR-0006), else reject — the
   * single gate for both starting a run and listing a checklist's runs. A foreign
   * or missing checklist is indistinguishable: both are "not found".
   */
  private async ownedChecklist(
    ownerId: Id,
    checklistId: Id,
  ): Promise<Checklist> {
    const checklist = await this.checklists.findById(checklistId);
    if (!checklist || !(await this.ownsRig(ownerId, checklist.rigId))) {
      throw new NotFoundException('Checklist not found');
    }
    return checklist;
  }

  /**
   * The trip if the owner owns it (via its rig, ADR-0006), else reject — the
   * gate for linking a run to a trip and for listing a trip's runs (issue
   * #111). A foreign or missing trip is indistinguishable: both "not found".
   */
  private async ownedTrip(ownerId: Id, tripId: Id): Promise<Trip> {
    const trip = await this.trips.findById(tripId);
    if (!trip || !(await this.ownsRig(ownerId, trip.rigId))) {
      throw new NotFoundException('Trip not found');
    }
    return trip;
  }

  /** Today as an IsoDate (`YYYY-MM-DD`), read from the injected clock. */
  private today(): string {
    return this.clock.now().toISOString().slice(0, 10);
  }

  /**
   * The Log Entry a client says it authored for a completion, if it is safe to honour
   * (ADR-0030, issue #144) — with `logEntryId` now arriving *from* the client, this is the
   * whole of the forgery guard, so it never trusts the id alone. Four things must hold:
   *
   * - **The entry exists.** A named id that resolves to nothing is not a link.
   * - **It sits on this run's rig.** The run was resolved through {@link get}, so matching
   *   its rig *is* the ownership check — another owner's entry can never match.
   * - **It names the step's own task**, so one task's work is never cross-filed under
   *   another. An orphan (`taskId` null — a one-time task deleted itself on completion,
   *   issue #28) passes this one on the rig check alone, exactly as
   *   {@link LogEntryService.replayedEntry} does: the entry no longer records which task
   *   it was, so there is nothing left to match, and the alternative is losing the link on
   *   the one path that cannot be re-derived.
   * - **Nothing already holds it.** An entry another step wrote is *not* adoptable, or a
   *   client could point a second step at it and then delete it by un-completing that
   *   step — destroying maintenance history and leaving the first step dangling. The
   *   check is rig-wide rather than run-wide because the theft works just as well from
   *   another run on the same rig (the same weekly checklist run again next week), and
   *   an orphan makes it widest of all: with no task left to match, the rig check would
   *   otherwise be the only thing standing between any task-linked step and any orphan.
   *
   * Anything that fails is discarded rather than rejected — the server then writes its own
   * entry, which is the same outcome a client that sent nothing would get.
   */
  private async adoptableEntry(
    run: Run,
    taskId: Id,
    entryId: Id,
  ): Promise<LogEntry | undefined> {
    const entry = await this.logEntries.findById(entryId);
    if (entry?.rigId !== run.rigId) {
      return undefined;
    }
    if (entry.taskId !== null && entry.taskId !== taskId) {
      return undefined;
    }
    // Only reached for a step holding no link of its own (a stored link wins earlier), so
    // any link found here belongs to some *other* step.
    return (await this.runs.anyStepLinksEntry(run.rigId, entry.id))
      ? undefined
      : entry;
  }

  /**
   * The T8 seam (issue #18), now per step: a task-linked step's *transition* into
   * `complete` writes a Log Entry for its task, snapshotting the task's fields **as they
   * are at completion time** together with the values entered on the step; leaving
   * `complete` deletes the entry that completion wrote, so an undone or skipped step never
   * falsely logs maintenance. Which entry a completion wrote rides on the step as
   * `logEntryId`.
   *
   * Two things keep that link honest now that a client may supply it (ADR-0030). A link
   * already stored always wins, so a replayed op adopts the entry the first delivery wrote
   * instead of writing a second — the idempotency ledger (issue #142) is the other belt,
   * not the only one. A link the client brings is checked by {@link adoptableEntry} before
   * it is honoured. A client link is adopted *as it stands*, without re-validating the
   * step's values against the task's current fields: the entry carries its own snapshot,
   * already validated when it was created, and re-checking it here would reject a
   * completion made offline under an older field schema.
   *
   * This is the *planning* half: it merges, validates, resolves tasks, and returns the
   * reconciled steps together with the entries to write and the detached entry ids to
   * delete — but touches nothing. {@link mergeSteps} flushes the plan only after the steps
   * write itself lands, so a merge that loses its compare-and-set writes no entries.
   */
  private async planStepMerge(
    run: Run,
    ops: readonly ResolvedStepOp[],
    performedOn: string,
  ): Promise<MaintenanceLogPlan> {
    const stored = new Map(run.steps.map((step) => [step.id, step]));
    // Only the steps an op actually moved; the rest of the run is not this
    // caller's business and is copied through untouched.
    const merged = new Map<Id, RunStep>();
    const claimedLinks = new Map<Id, Id>();

    for (const op of ops) {
      const base = merged.get(op.stepId) ?? stored.get(op.stepId);
      if (base === undefined) {
        // A run's steps are minted at create and never added to or removed, so an
        // unknown id can only be a client bug — and a bug no retry can fix, which is
        // why it must be a 4xx (the offline queue retries 5xx without cap).
        throw new BadRequestException(`no step ${op.stepId} on this run`);
      }
      if (isStale(base, op)) {
        continue;
      }
      merged.set(op.stepId, applyOp(base, op));
      // An omitted field is left alone, links included: a follow-up op capturing
      // values must not drop the entry an earlier op in the same batch named, or
      // the completion would write a second entry beside the client's.
      if (op.logEntryId !== undefined) {
        claimedLinks.set(op.stepId, op.logEntryId);
      }
    }

    const entries: LogEntry[] = [];
    const detached: Id[] = [];
    // Links this batch has already handed out. Nothing is written yet, so
    // `adoptableEntry`'s stored-link check cannot see them, and two ops in one
    // batch naming the same entry would otherwise both adopt it.
    const takenLinks = new Set<Id>();
    for (const [stepId, step] of merged) {
      const written = stored.get(stepId)?.logEntryId;
      if (step.taskId === undefined || step.state !== 'complete') {
        if (written !== undefined) {
          detached.push(written);
        }
        continue;
      }
      if (written !== undefined) {
        step.logEntryId = written;
        continue;
      }
      const claimed = claimedLinks.get(stepId);
      const adopted =
        claimed === undefined || takenLinks.has(claimed)
          ? undefined
          : await this.adoptableEntry(run, step.taskId, claimed);
      if (adopted !== undefined) {
        step.logEntryId = adopted.id;
        takenLinks.add(adopted.id);
        continue;
      }
      // A gone task, or one not on the run's rig (authoring doesn't referentially
      // constrain `taskId`, and a forged link must never log onto another owner's
      // task), completes without logging — there is nothing to log against.
      const task = await this.tasks.findById(step.taskId);
      if (task?.rigId !== run.rigId) {
        continue;
      }
      // Required fields must carry a value, exactly as standalone perform enforces.
      const result = validateFieldValues(task.fieldSchema, step.values ?? []);
      if (!result.valid) {
        throw new BadRequestException(result.errors.join('; '));
      }
      const entry = buildEntry(task, step, performedOn);
      entries.push(entry);
      step.logEntryId = entry.id;
    }

    const steps = run.steps.map((step) => merged.get(step.id) ?? step);
    // Second belt on the same guarantee as `adoptableEntry`'s fourth check: never delete
    // an entry another step of this run still points at. Adoption is checked before a
    // link is granted, but that check reads the row and this one reads the merged result,
    // so a claim that slipped through concurrently still costs nobody their history —
    // the thief simply un-completes with the entry left where it was.
    const stillLinked = new Set(
      steps.flatMap((step) =>
        step.logEntryId === undefined ? [] : [step.logEntryId],
      ),
    );
    return {
      steps,
      entries,
      detachedEntryIds: detached.filter((id) => !stillLinked.has(id)),
    };
  }

  /**
   * Fill in each operation's clock reading. An op that carries none falls back to the
   * request's `X-Edited-At`, then to now — "no stamp" has always meant "apply", and an op
   * stamped now beats anything already stored. One that does carry a stamp is clamped to
   * server time exactly as the header is, so a device with a wrong clock cannot park a step
   * in the future and veto every later edit to it.
   */
  private resolveOps(
    ops: readonly RunStepOp[],
    headerEditedAt: Date | undefined,
  ): ResolvedStepOp[] {
    const now = new Date();
    return ops.map(({ editedAt, ...op }) => {
      if (editedAt === undefined) {
        return headerEditedAt === undefined
          ? { ...op, editedAt: now, stamped: false }
          : { ...op, editedAt: headerEditedAt, stamped: true };
      }
      const stamp = new Date(editedAt);
      return { ...op, editedAt: stamp > now ? now : stamp, stamped: true };
    });
  }

  /**
   * Merge a batch of operations into the run's steps and write them.
   *
   * The write is a compare-and-set on the steps array alone, never the record-level LWW
   * gate: a stale whole-run stamp must not be able to erase a fresh per-step merge, and a
   * merge must not be able to bump a clock that governs `startedOn`. Losing the
   * compare-and-set means someone else's merge landed first, so this one re-reads and
   * replans against what actually landed rather than overwriting it — the point of the
   * whole ticket is that both survive. A run that keeps losing is a hot loop the caller
   * should back off from, not something to retry forever, so it gives up as a 409.
   *
   * The maintenance-log plan is flushed only once the steps write lands, so a lost round
   * writes and deletes nothing.
   */
  private async mergeSteps(
    ownerId: Id,
    id: Id,
    ops: readonly ResolvedStepOp[],
    performedOn?: string,
  ): Promise<Run> {
    let run = await this.get(ownerId, id);
    for (let attempt = 0; attempt < MERGE_ATTEMPTS; attempt += 1) {
      const plan = await this.planStepMerge(
        run,
        ops,
        performedOn ?? run.startedOn,
      );
      const { applied, record } = await this.runs.saveStepsIfUnchanged(
        run.id,
        plan.steps,
        run.steps,
      );
      if (applied) {
        for (const entry of plan.entries) {
          await this.logEntries.save(entry);
        }
        for (const entryId of plan.detachedEntryIds) {
          await this.logEntries.delete(entryId);
        }
        return record;
      }
      run = record;
    }
    throw new ConflictException('run steps changed concurrently; try again');
  }

  /**
   * Start a run over one of the owner's checklists — the server copies its
   * steps. A `tripId` links the run to a trip from the start (issue #111); the
   * trip must be the owner's and live on the same rig as the checklist (a run
   * belongs to its checklist's rig, so a cross-rig trip link is nonsense).
   *
   * The run's own id may be the client's (issue #143); its step ids stay
   * server-minted, since the steps are copied from the checklist rather than
   * sent — a client names steps by the id the create hands back.
   */
  async create(
    ownerId: Id,
    input: CreateRunWithId,
    editedAt?: Date,
  ): Promise<Run> {
    const checklist = await this.ownedChecklist(ownerId, input.checklistId);
    if (input.tripId !== undefined) {
      const trip = await this.ownedTrip(ownerId, input.tripId);
      if (trip.rigId !== checklist.rigId) {
        throw new BadRequestException(
          'trip and checklist belong to different rigs',
        );
      }
    }
    return adoptCreated(
      await this.runs.insert(
        {
          id: input.id ?? randomUUID(),
          checklistId: checklist.id,
          rigId: checklist.rigId,
          ...(input.tripId !== undefined && { tripId: input.tripId }),
          startedOn: input.startedOn ?? this.today(),
          steps: checklist.steps.map((step) =>
            toRunStep(step, (editedAt ?? new Date()).toISOString()),
          ),
        },
        editedAt,
      ),
      (run) => run.checklistId === checklist.id,
      'Run not found',
    );
  }

  /** One of the owner's runs, or `NotFound` if missing or another's. */
  async get(ownerId: Id, id: Id): Promise<Run> {
    const run = await this.runs.findById(id);
    if (run && (await this.ownsRig(ownerId, run.rigId))) {
      return run;
    }
    throw new NotFoundException('Run not found');
  }

  /** The past runs of one of the owner's checklists. */
  async listByChecklist(ownerId: Id, checklistId: Id): Promise<Run[]> {
    await this.ownedChecklist(ownerId, checklistId);
    return this.runs.listByChecklist(checklistId);
  }

  /**
   * Every run on one of the owner's rigs, across its checklists — the home
   * summary read (issue #22: the "in progress" tile and continue cards need
   * the rig's runs without a request per checklist).
   */
  async listByRig(ownerId: Id, rigId: Id): Promise<Run[]> {
    if (!(await this.ownsRig(ownerId, rigId))) {
      throw new NotFoundException('Rig not found');
    }
    return this.runs.listByRig(rigId);
  }

  /** The runs linked to one of the owner's trips — the trip screen's run list (issue #111). */
  async listByTrip(ownerId: Id, tripId: Id): Promise<Run[]> {
    await this.ownedTrip(ownerId, tripId);
    return this.runs.listByTrip(tripId);
  }

  /**
   * Apply a batch of step operations to one of the owner's runs (ADR-0030, issue #144) —
   * the offline-safe way to record run work. Each op names one step, so two devices that
   * worked through *different* steps of the same run both keep their work no matter which
   * queue drains first; the same step edited twice resolves newest-wins on the ops' own
   * clock readings. Nothing here touches the run's record-level edit time, so step work and
   * a `startedOn` correction never veto each other.
   */
  async applyStepOps(
    ownerId: Id,
    id: Id,
    ops: readonly RunStepOp[],
    editedAt?: Date,
  ): Promise<Run> {
    return this.mergeSteps(ownerId, id, this.resolveOps(ops, editedAt));
  }

  /**
   * Apply a partial edit to one of the owner's runs (checklist/rig never change).
   *
   * The two fields take different paths (ADR-0030). `startedOn` is per-record LWW
   * (ADR-0028, issue #141): a stale stamp leaves the date where it was. `steps` is a
   * per-step merge — every element of the array is one operation stamped with this
   * request's `X-Edited-At`, so a client that sends the whole array gets what it always
   * got, while a stale one can only lose the steps it is actually stale about. Neither
   * path can veto the other: a run whose steps merged still refuses an out-of-date
   * re-dating, and an accepted re-dating cannot roll back another device's completions.
   *
   * The re-dating therefore writes `startedOn` **alone**. Writing the whole run instead
   * would ship the steps read at the top of this method, and since the run screen now
   * fires a step operation on every tap, a re-dating from a second device would quietly
   * swallow the taps made while it was in flight — the record clock cannot catch that,
   * because a step merge deliberately never moves it.
   */
  async update(
    ownerId: Id,
    id: Id,
    changes: UpdateRun,
    editedAt?: Date,
  ): Promise<Run> {
    const existing = await this.get(ownerId, id);
    const startedOn = changes.startedOn ?? existing.startedOn;
    const current =
      changes.steps === undefined
        ? existing
        : await this.mergeSteps(
            ownerId,
            id,
            changes.steps.map((step) => ({
              stepId: step.id,
              state: step.state,
              // A whole-array edit says what every step holds, so an omitted
              // `values` means "no answers" rather than "leave them" — the
              // shape this body has always had.
              values: step.values ?? [],
              ...(step.logEntryId !== undefined && {
                logEntryId: step.logEntryId,
              }),
              editedAt: editedAt ?? new Date(),
              stamped: editedAt !== undefined,
            })),
            startedOn,
          );
    if (changes.startedOn === undefined) {
      return current;
    }
    const gated = await this.runs.saveStartedOn(id, startedOn, editedAt);
    return gated.record;
  }

  /** Delete one of the owner's runs (e.g. one started by mistake). */
  async remove(ownerId: Id, id: Id): Promise<void> {
    const run = await this.get(ownerId, id);
    await this.runs.delete(run.id);
  }
}

import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LogEntryRepository,
  MaintenanceTaskRepository,
  ownedOrUndefined,
  RigRepository,
} from '@rv-checklist/api-data-access';
import {
  validateFieldValues,
  type CreateLogEntryWithId,
  type Id,
  type LogEntry,
  type LoggedField,
  type MaintenanceTask,
  type UpdateLogEntry,
} from '@rv-checklist/domain';
import { adoptCreated } from '../common/adopt-created.js';

/**
 * Reject a snapshot whose `required` fields carry no value (spec §Testing —
 * "enforce required"). The rule is checked against the entry's *own* snapshot,
 * not the task's current fields, so entries recorded under an older field
 * schema stay correctable.
 */
function assertRequiredValues(fields: readonly LoggedField[]): void {
  const result = validateFieldValues(
    fields,
    fields.map(({ name, value }) => ({ name, value })),
  );
  if (!result.valid) {
    throw new BadRequestException(result.errors.join('; '));
  }
}

/**
 * Log entries — the dated records that a task was performed — owner-scoped
 * (issue #17). Standalone completion writes an entry directly (story 45); the
 * body carries the entry's own snapshot of the task's fields with the recorded
 * values (ADR-0004), so a later edit to the task never rewrites it — the copy
 * is the guarantee, held by the entry, not enforced per-edit.
 *
 * An entry belongs to a rig via its task (ADR-0006): the create body names
 * only the task, and `create` **derives** the rig from it, so an entry can
 * never land on a rig its task doesn't belong to. Ownership (ADR-0003) is
 * resolved through the rig exactly as {@link MaintenanceTaskService} does — a
 * foreign id is indistinguishable from "not found". Nothing is locked
 * (CONTEXT.md): entries stay editable so the owner can correct a date or value.
 */
@Injectable()
export class LogEntryService {
  constructor(
    private readonly logEntries: LogEntryRepository,
    private readonly tasks: MaintenanceTaskRepository,
    private readonly rigs: RigRepository,
  ) {}

  /** Whether the rig exists and belongs to the owner — the single ownership gate. */
  private async ownsRig(ownerId: Id, rigId: Id): Promise<boolean> {
    return (
      ownedOrUndefined(await this.rigs.findById(rigId), ownerId) !== undefined
    );
  }

  /**
   * The task if the owner owns it (via its rig, ADR-0006), else `undefined` —
   * a foreign task and a missing one are the same answer.
   */
  private async ownedTaskOrUndefined(
    ownerId: Id,
    taskId: Id,
  ): Promise<MaintenanceTask | undefined> {
    const task = await this.tasks.findById(taskId);
    return task && (await this.ownsRig(ownerId, task.rigId)) ? task : undefined;
  }

  /**
   * The task if the owner owns it, else reject — the gate for both logging a
   * completion and listing a task's history. A foreign or missing task is
   * indistinguishable: both are "not found".
   */
  private async ownedTask(ownerId: Id, taskId: Id): Promise<MaintenanceTask> {
    const task = await this.ownedTaskOrUndefined(ownerId, taskId);
    if (!task) {
      throw new NotFoundException('Maintenance task not found');
    }
    return task;
  }

  /**
   * The entry a create already wrote, for a create whose task no longer exists
   * — the replay of a completed one-time task (ADR-0028's named trap). The task
   * is gone *because* the first call deleted it, so there is nothing left to
   * resolve the create against; the stored entry is the proof it succeeded.
   *
   * Ownership resolves through the entry's own rig, exactly as {@link get}
   * does, because the id is client input: a row belonging to someone else is
   * never handed back and stays indistinguishable from the missing task it
   * would otherwise have reported. An orphan (`taskId` null — the task was
   * deleted under ON DELETE SET NULL, issue #28) is the shape this trap leaves
   * behind, and an orphan no longer records *which* task it was, so ownership
   * is the whole of the check there; an entry still naming some other, living
   * task is visibly not this create's and is refused.
   */
  private async replayedEntry(
    ownerId: Id,
    input: CreateLogEntryWithId,
  ): Promise<LogEntry> {
    const entry =
      input.id === undefined
        ? undefined
        : await this.logEntries.findById(input.id);
    if (
      entry &&
      (entry.taskId === null || entry.taskId === input.taskId) &&
      (await this.ownsRig(ownerId, entry.rigId))
    ) {
      return entry;
    }
    throw new NotFoundException('Maintenance task not found');
  }

  /**
   * Record that one of the owner's tasks was performed — the rig comes from
   * the task. `id` may be the client's own (issue #143): a replayed create
   * writes nothing and returns the entry already stored, edit time included.
   * The task is resolved first, but a *missing* task is not the end of the
   * road — a one-time task deletes itself on completion (below), so the replay
   * of that very create arrives to find no task, and {@link replayedEntry}
   * answers it from the entry instead.
   */
  async create(
    ownerId: Id,
    input: CreateLogEntryWithId,
    editedAt?: Date,
  ): Promise<LogEntry> {
    const task = await this.ownedTaskOrUndefined(ownerId, input.taskId);
    if (task === undefined) {
      return this.replayedEntry(ownerId, input);
    }
    assertRequiredValues(input.fields);
    const inserted = await this.logEntries.insert(
      {
        id: input.id ?? randomUUID(),
        taskId: task.id,
        rigId: task.rigId,
        // Snapshot the task's name as it is now (issue #27) — a later rename must
        // not relabel this entry, exactly as the field snapshot is frozen.
        taskName: task.name,
        performedOn: input.performedOn,
        // The rig's Distance reading at the time (issue #32), if the owner gave
        // one — the anchor a distance Interval measures from. Absent means absent.
        ...(input.distanceKm !== undefined && { distanceKm: input.distanceKm }),
        // The cost in cents (issue #39), if the owner recorded one. Absent means absent.
        ...(input.costCents !== undefined && { costCents: input.costCents }),
        // The free-text comment (issue #101), if the owner wrote one. Absent means absent.
        ...(input.comment !== undefined && { comment: input.comment }),
        fields: input.fields,
      },
      editedAt,
    );
    const entry = adoptCreated(
      inserted,
      (existing) => existing.taskId === task.id,
      'Log entry not found',
    );
    // A one-time task is done once (issue #29): performing it writes this entry,
    // then the task deletes itself. The entry is the permanent record — it
    // outlives the task, kept and orphaned via ON DELETE SET NULL (issue #28),
    // still owned through its rig and labeled by its snapshotted taskName.
    // Only a call that really wrote deletes: a replay that still finds its task
    // (the owner re-created it in between) wrote nothing, so it undoes nothing.
    if (inserted.created && task.oneTime) {
      await this.tasks.delete(task.id);
    }
    return entry;
  }

  /** One of the owner's entries, or `NotFound` if missing or another's. */
  async get(ownerId: Id, id: Id): Promise<LogEntry> {
    const entry = await this.logEntries.findById(id);
    if (entry && (await this.ownsRig(ownerId, entry.rigId))) {
      return entry;
    }
    throw new NotFoundException('Log entry not found');
  }

  /** The full log history of one of the owner's tasks. */
  async listByTask(ownerId: Id, taskId: Id): Promise<LogEntry[]> {
    await this.ownedTask(ownerId, taskId);
    return this.logEntries.listByTask(taskId);
  }

  /**
   * Every entry on one of the owner's rigs, across its tasks — the due-status
   * read (ADR-0005): the task list computes each task's standing from the
   * rig's entries without a request per task.
   */
  async listByRig(ownerId: Id, rigId: Id): Promise<LogEntry[]> {
    if (!(await this.ownsRig(ownerId, rigId))) {
      throw new NotFoundException('Rig not found');
    }
    return this.logEntries.listByRig(rigId);
  }

  /**
   * Correct a past entry's date, Distance reading, and/or values (task/rig never
   * change). `distanceKm` carries the removal marker the other fields lack: an
   * explicit `null` clears a recorded reading (issue #32), an omitted key leaves
   * it unchanged.
   */
  async update(
    ownerId: Id,
    id: Id,
    changes: UpdateLogEntry,
    editedAt?: Date,
  ): Promise<LogEntry> {
    const existing = await this.get(ownerId, id);
    if (changes.fields !== undefined) {
      assertRequiredValues(changes.fields);
    }
    const next: LogEntry = {
      ...existing,
      ...(changes.performedOn !== undefined && {
        performedOn: changes.performedOn,
      }),
      ...(changes.fields !== undefined && { fields: changes.fields }),
    };
    if (changes.distanceKm === null) {
      delete next.distanceKm;
    } else if (changes.distanceKm !== undefined) {
      next.distanceKm = changes.distanceKm;
    }
    if (changes.costCents === null) {
      delete next.costCents;
    } else if (changes.costCents !== undefined) {
      next.costCents = changes.costCents;
    }
    if (changes.comment === null) {
      delete next.comment;
    } else if (changes.comment !== undefined) {
      next.comment = changes.comment;
    }
    if (editedAt === undefined) {
      return this.logEntries.save(next);
    }
    // Per-record LWW (ADR-0028, issue #141): a stale stamp no-ops to the
    // current record.
    const { record } = await this.logEntries.saveIfNewer(next, editedAt);
    return record;
  }

  /** Delete one of the owner's entries (a mistaken record). */
  async remove(ownerId: Id, id: Id): Promise<void> {
    const entry = await this.get(ownerId, id);
    await this.logEntries.delete(entry.id);
  }
}

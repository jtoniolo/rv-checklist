import { z } from 'zod';
import { isFieldSourceValid, taskLinkedFieldsIssue } from './checklist.js';
import { IdSchema, IsoDateSchema, IsoDateTimeSchema } from './common.js';
import { FieldSchemaSchema, RecordedFieldValueSchema } from './field-schema.js';

/**
 * Step state within a run — not a boolean (CONTEXT.md). `skipped` is a deliberate "not
 * doing this one", distinct from `incomplete` (not done yet). Only *completing* a
 * task-linked step records maintenance; skipping records nothing.
 */
export const StepStateSchema = z.enum(['incomplete', 'complete', 'skipped']);
export type StepState = z.infer<typeof StepStateSchema>;

/**
 * A RunStep — a run's own copy of a checklist step, carrying per-step state and any values
 * captured on completion. Like a checklist step, a task-linked step never defines its own
 * fields (ADR-0008).
 *
 * `logEntryId` links a completed task-linked step to the Log Entry its completion wrote
 * (issue #18). The API still assigns it whenever it writes the entry itself, and still
 * clears it (deleting the entry) when the completion is undone — but it is no longer
 * server-*only*. An offline client that authored the entry itself may name it
 * (ADR-0030, issue #144), and the API honours that link when the entry exists on the run's
 * rig and belongs to the step's task; anything else is discarded and the API writes its own
 * entry, so a forged link can neither point at another owner's entry nor detach one.
 *
 * `editedAt` is the step's **own** last-write stamp — the per-step LWW clock that lets a
 * phone and a tablet complete *different* steps of one run offline and keep both
 * (ADR-0030). It rides inside the step because a run's steps are one jsonb column, which is
 * the one place a per-record edit time cannot live. The API sets it from each operation's
 * clock reading; a client never authors it.
 */
export const RunStepSchema = z
  .object({
    id: IdSchema,
    text: z.string().min(1),
    taskId: IdSchema.optional(),
    fieldSchema: FieldSchemaSchema.optional(),
    state: StepStateSchema,
    values: z.array(RecordedFieldValueSchema).optional(),
    logEntryId: IdSchema.optional(),
    editedAt: IsoDateTimeSchema.optional(),
  })
  .refine(isFieldSourceValid, taskLinkedFieldsIssue);
export type RunStep = z.infer<typeof RunStepSchema>;

/**
 * One **step operation** (ADR-0030, issue #144) — a change to a single step of a run,
 * merged server-side into the stored array by `stepId`. This is the offline-safe unit of
 * run work: two devices whose queues touch different steps both land, because neither
 * carries an opinion about the steps it did not touch.
 *
 * Omitted fields are left as they are: an op carrying only `values` never moves the step's
 * state, and one carrying only `state` never clears its answers.
 *
 * `editedAt` is the operation's own clock reading, clamped to server time on receipt. The
 * newest stamp wins **per step**, so the same step edited on two devices resolves
 * newest-wins while different steps merge; an absent stamp means "now", which always wins.
 *
 * `logEntryId` names a Log Entry the client authored itself for a task-linked completion
 * (the offline path: post the entry, then the op). The server honours it only after
 * checking it — see {@link RunStepSchema}.
 */
export const RunStepOpSchema = z.object({
  stepId: IdSchema,
  state: StepStateSchema.optional(),
  values: z.array(RecordedFieldValueSchema).optional(),
  logEntryId: IdSchema.optional(),
  editedAt: IsoDateTimeSchema.optional(),
});
export type RunStepOp = z.infer<typeof RunStepOpSchema>;

/**
 * `POST /runs/:id/step-ops` body — a batch of step operations applied in the order given,
 * so one reconnect flushes a whole queue in a single request. At least one op is required;
 * an empty batch has no meaning and is a client bug.
 */
export const RunStepOpsSchema = z.object({
  ops: z.array(RunStepOpSchema).min(1),
});
export type RunStepOps = z.infer<typeof RunStepOpsSchema>;

/**
 * A Run — a dated copy of a checklist's steps, created when the user starts working through
 * it (CONTEXT.md). It is a copy, not a frozen snapshot: runs and their answers stay
 * editable, and later checklist edits never alter it.
 *
 * `tripId` links the run to a Trip as a grouping of convenience (CONTEXT.md,
 * issue #111) — the same checklist may be run any number of times on one trip.
 * Optional: most runs have no trip. Absent also covers a since-deleted trip
 * (deleting a trip unlinks its runs, never deletes them).
 */
export const RunSchema = z.object({
  id: IdSchema,
  checklistId: IdSchema,
  rigId: IdSchema,
  tripId: IdSchema.optional(),
  startedOn: IsoDateSchema,
  steps: z.array(RunStepSchema),
});
export type Run = z.infer<typeof RunSchema>;

/**
 * Create body — starting a run needs only the checklist; the server copies its steps.
 * `startedOn` may be supplied, else the server dates it. A `tripId` links the
 * run to one of the rig's trips from the start (issue #111).
 */
export const CreateRunSchema = z.object({
  checklistId: IdSchema,
  tripId: IdSchema.optional(),
  startedOn: IsoDateSchema.optional(),
});
export type CreateRun = z.infer<typeof CreateRunSchema>;

/** The create body with an optional client-generated `id` — see {@link CreateRigWithIdSchema} (issue #143). */
export const CreateRunWithIdSchema = CreateRunSchema.extend({
  id: IdSchema.optional(),
});
export type CreateRunWithId = z.infer<typeof CreateRunWithIdSchema>;

/**
 * Edit body — nothing is locked (CONTEXT.md), so a run stays editable after the fact. The
 * whole `steps` array travels (like a checklist edit), each carrying its own state and any
 * captured answers, so marking steps / entering values / correcting a mistake is one save.
 * The occasion date may be corrected too. Both fields are optional; an empty edit is a
 * no-op. A run never changes which checklist or rig it belongs to, so neither is editable.
 *
 * Since ADR-0030 the `steps` array is **merged by step id**, not swapped in wholesale: each
 * element is one {@link RunStepOpSchema} in disguise, stamped with the request's
 * `X-Edited-At`. A step the array omits is left alone rather than dropped, and a step whose
 * stored stamp is newer keeps what it has. For a client that sends every step at once — the
 * shape this body was written for — the outcome is unchanged. New work should prefer
 * `POST /runs/:id/step-ops`, which says the same thing without the round trip through a
 * full array; `startedOn` has no per-step equivalent and stays per-record LWW.
 */
export const UpdateRunSchema = z
  .object({
    startedOn: IsoDateSchema,
    steps: z.array(RunStepSchema),
  })
  .partial();
export type UpdateRun = z.infer<typeof UpdateRunSchema>;

/** A run's per-state step tally, and whether work remains. */
export interface RunProgress {
  readonly completed: number;
  readonly skipped: number;
  readonly incomplete: number;
  readonly total: number;
  /** True while any step is still `incomplete` — the run can be resumed. */
  readonly inProgress: boolean;
}

/**
 * Tally a run's steps by state. A run is **in progress** while any step is still
 * `incomplete` — the "identify and resume" case (story 26): the owner can put
 * the phone down and come back to what's left. A run with no incomplete steps is
 * done, whether its steps were completed or deliberately skipped.
 */
export function runProgress(run: {
  readonly steps: readonly { readonly state: StepState }[];
}): RunProgress {
  const tally = { completed: 0, skipped: 0, incomplete: 0 };
  for (const step of run.steps) {
    if (step.state === 'complete') tally.completed += 1;
    else if (step.state === 'skipped') tally.skipped += 1;
    else tally.incomplete += 1;
  }
  return {
    ...tally,
    total: run.steps.length,
    inProgress: tally.incomplete > 0,
  };
}

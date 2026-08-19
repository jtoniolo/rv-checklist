import { z } from 'zod';
import { isFieldSourceValid, taskLinkedFieldsIssue } from './checklist.js';
import { IdSchema, IsoDateSchema } from './common.js';
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
 * fields (ADR-0008). `logEntryId` links a completed task-linked step to the Log Entry its
 * completion wrote (issue #18); it is **server-managed** — the API assigns it on
 * completion, clears it (deleting the entry) when the completion is undone, and ignores
 * whatever a client sends.
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
  })
  .refine(isFieldSourceValid, taskLinkedFieldsIssue);
export type RunStep = z.infer<typeof RunStepSchema>;

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

/**
 * Edit body — nothing is locked (CONTEXT.md), so a run stays editable after the fact. The
 * whole `steps` array travels (like a checklist edit), each carrying its own state and any
 * captured answers, so marking steps / entering values / correcting a mistake is one save.
 * The occasion date may be corrected too. Both fields are optional; an empty edit is a
 * no-op. A run never changes which checklist or rig it belongs to, so neither is editable.
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

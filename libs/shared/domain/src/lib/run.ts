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
 * fields (ADR-0008).
 */
export const RunStepSchema = z
  .object({
    id: IdSchema,
    text: z.string().min(1),
    taskId: IdSchema.optional(),
    fieldSchema: FieldSchemaSchema.optional(),
    state: StepStateSchema,
    values: z.array(RecordedFieldValueSchema).optional(),
  })
  .refine(isFieldSourceValid, taskLinkedFieldsIssue);
export type RunStep = z.infer<typeof RunStepSchema>;

/**
 * A Run — a dated copy of a checklist's steps, created when the user starts working through
 * it (CONTEXT.md). It is a copy, not a frozen snapshot: runs and their answers stay
 * editable, and later checklist edits never alter it.
 */
export const RunSchema = z.object({
  id: IdSchema,
  checklistId: IdSchema,
  rigId: IdSchema,
  startedOn: IsoDateSchema,
  steps: z.array(RunStepSchema),
});
export type Run = z.infer<typeof RunSchema>;

/**
 * Create body — starting a run needs only the checklist; the server copies its steps.
 * `startedOn` may be supplied, else the server dates it.
 */
export const CreateRunSchema = z.object({
  checklistId: IdSchema,
  startedOn: IsoDateSchema.optional(),
});
export type CreateRun = z.infer<typeof CreateRunSchema>;

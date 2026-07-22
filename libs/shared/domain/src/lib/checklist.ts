import { z } from 'zod';
import { IdSchema, type Id } from './common.js';
import { FieldSchemaSchema } from './field-schema.js';

/**
 * A Step — one ordered entry in a checklist (CONTEXT.md). Order is the array position in
 * `Checklist.steps`, not a field on the step. A step may link to a maintenance task, or a
 * plain step may define its own `field_schema` — but **never both** (ADR-0008): a
 * task-linked step takes its fields from the task.
 */
const stepShape = {
  text: z.string().min(1),
  taskId: IdSchema.optional(),
  fieldSchema: FieldSchemaSchema.optional(),
};

/**
 * The ADR-0008 rule: a task-linked step (has a `taskId`) must not carry its own
 * `field_schema`. Exported so the run's step copy (`RunStepSchema`) enforces the identical
 * rule without restating it.
 */
export function isFieldSourceValid(step: {
  readonly taskId?: string | undefined;
  readonly fieldSchema?: readonly unknown[] | undefined;
}): boolean {
  return step.taskId === undefined || !((step.fieldSchema?.length ?? 0) > 0);
}

export const taskLinkedFieldsIssue = {
  message: 'a task-linked step must not define its own fields (ADR-0008)',
  path: ['fieldSchema'],
};

const StepInputBaseSchema = z.object(stepShape);

/** A step in a create body — no server-assigned id yet. */
export const StepInputSchema = StepInputBaseSchema.refine(
  isFieldSourceValid,
  taskLinkedFieldsIssue,
);
export type StepInput = z.infer<typeof StepInputSchema>;

/** A persisted step. */
export const StepSchema = StepInputBaseSchema.extend({ id: IdSchema }).refine(
  isFieldSourceValid,
  taskLinkedFieldsIssue,
);
export type Step = z.infer<typeof StepSchema>;

/**
 * A step in an edit body: an existing step carries its `id` (to preserve identity across a
 * reorder/edit), a newly added one omits it.
 */
export const StepPatchSchema = StepInputBaseSchema.extend({
  id: IdSchema.optional(),
}).refine(isFieldSourceValid, taskLinkedFieldsIssue);
export type StepPatch = z.infer<typeof StepPatchSchema>;

/**
 * A Checklist — a reusable, ordered, taggable template (CONTEXT.md). Editing it never
 * mutates existing runs; a run holds its own copy of the steps.
 */
export const ChecklistSchema = z.object({
  id: IdSchema,
  rigId: IdSchema,
  name: z.string().min(1),
  tags: z.array(z.string().min(1)),
  steps: z.array(StepSchema),
});
export type Checklist = z.infer<typeof ChecklistSchema>;

/** One checklist a maintenance task appears on, with the steps that link it. */
export interface TaskAppearance {
  readonly checklist: Checklist;
  readonly steps: readonly Step[];
}

/**
 * Where a maintenance task appears (issue #24): every checklist with at least
 * one step linked to the task, each appearing once and carrying all of its
 * linked steps.
 */
export function taskAppearances(
  checklists: readonly Checklist[],
  taskId: Id,
): TaskAppearance[] {
  return checklists
    .map((checklist) => ({
      checklist,
      steps: checklist.steps.filter((step) => step.taskId === taskId),
    }))
    .filter((appearance) => appearance.steps.length > 0);
}

/** Create body — `id` is server-assigned; tags and steps default to empty. */
export const CreateChecklistSchema = z.object({
  rigId: IdSchema,
  name: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
  steps: z.array(StepInputSchema).default([]),
});
export type CreateChecklist = z.infer<typeof CreateChecklistSchema>;

/** Edit body — any subset of the editable fields (rig membership never changes). */
export const UpdateChecklistSchema = z
  .object({
    name: z.string().min(1),
    tags: z.array(z.string().min(1)),
    steps: z.array(StepPatchSchema),
  })
  .partial();
export type UpdateChecklist = z.infer<typeof UpdateChecklistSchema>;

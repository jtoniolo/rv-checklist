import { z } from 'zod';
import { IdSchema, IsoDateSchema } from './common.js';
import {
  duplicateFieldNameIssues,
  FieldDefinitionBaseSchema,
  FieldValueSchema,
  isSupportedField,
  isUnitOnlyOnNumber,
  PHOTO_FIELD_ISSUE,
  UNIT_ONLY_ON_NUMBER_ISSUE,
} from './field-schema.js';

/**
 * A LoggedField — a task field definition snapshotted onto a log entry together with its
 * recorded `value` (ADR-0004). The snapshot gives per-entry versioning: editing the task
 * later never rewrites past entries. `value` may be absent for an unfilled optional field.
 * Carries the same `photo` / `unit` rules as a live field definition.
 */
export const LoggedFieldSchema = FieldDefinitionBaseSchema.extend({
  value: FieldValueSchema.optional(),
})
  .refine(isSupportedField, PHOTO_FIELD_ISSUE)
  .refine(isUnitOnlyOnNumber, UNIT_ONLY_ON_NUMBER_ISSUE);
export type LoggedField = z.infer<typeof LoggedFieldSchema>;

/**
 * A Log Entry — the dated record that a maintenance task was performed (CONTEXT.md).
 * Carries its own snapshot copy of the task's fields with the recorded values; editable.
 */
export const LogEntrySchema = z.object({
  id: IdSchema,
  taskId: IdSchema,
  rigId: IdSchema,
  performedOn: IsoDateSchema,
  fields: z.array(LoggedFieldSchema).superRefine((fields, ctx) => {
    for (const { name, index } of duplicateFieldNameIssues(fields)) {
      ctx.addIssue({
        code: 'custom',
        message: `duplicate field name: ${name}`,
        path: [index, 'name'],
      });
    }
  }),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

/** Create body — `id` is server-assigned. Used for both task-linked and standalone completion. */
export const CreateLogEntrySchema = LogEntrySchema.omit({ id: true });
export type CreateLogEntry = z.infer<typeof CreateLogEntrySchema>;

/** Edit body — a past entry stays editable (correct a date or a value). */
export const UpdateLogEntrySchema = z
  .object({
    performedOn: IsoDateSchema,
    fields: LogEntrySchema.shape.fields,
  })
  .partial();
export type UpdateLogEntry = z.infer<typeof UpdateLogEntrySchema>;

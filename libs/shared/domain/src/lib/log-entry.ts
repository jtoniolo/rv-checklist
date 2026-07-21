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
  type FieldDefinition,
  type FieldValue,
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

/**
 * Create body — `id` is server-assigned and `rigId` is derived from the task
 * (an entry can never land on a rig its task doesn't belong to), so the client
 * names only the task, the date, and the field snapshot.
 */
export const CreateLogEntrySchema = LogEntrySchema.omit({
  id: true,
  rigId: true,
});
export type CreateLogEntry = z.infer<typeof CreateLogEntrySchema>;

/**
 * Snapshot a field schema into log-entry fields, attaching each recorded value to its
 * definition by name (ADR-0004's copy-with-values). Fields nobody filled stay value-less;
 * recorded values that name no field are dropped — the schema decides what the entry holds.
 */
export function toLoggedFields(
  schema: readonly FieldDefinition[],
  values:
    | readonly { readonly name: string; readonly value: FieldValue }[]
    | undefined,
): LoggedField[] {
  const byName = new Map((values ?? []).map((v) => [v.name, v.value]));
  return schema.map((field) => {
    const value = byName.get(field.name);
    return { ...field, ...(value !== undefined && { value }) };
  });
}

/** Edit body — a past entry stays editable (correct a date or a value). */
export const UpdateLogEntrySchema = z
  .object({
    performedOn: IsoDateSchema,
    fields: LogEntrySchema.shape.fields,
  })
  .partial();
export type UpdateLogEntry = z.infer<typeof UpdateLogEntrySchema>;

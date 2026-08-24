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

/** The longest comment a log entry can carry (issue #101) — shared with the web form. */
export const LOG_ENTRY_COMMENT_MAX_LENGTH = 500;

/**
 * A Log Entry — the dated record that a maintenance task was performed (CONTEXT.md).
 * Carries its own snapshot copy of the task's fields with the recorded values, plus
 * `taskName` — the task's name *as it was when performed* (issue #27). A Log Entry is a
 * true snapshot: renaming the task later must never relabel a past entry, so the name is
 * frozen onto the entry exactly as `fields` is, not read live off the task. Editable.
 *
 * `taskId` is nullable: deleting a task must never lose "when did I last do this?", so an
 * entry outlives its task (issue #28). When the task is gone `taskId` is `null` — the entry
 * survives, owned via its still-present `rigId` and labeled by its snapshotted `taskName` —
 * and stays individually editable and deletable. A live entry always names a real task.
 *
 * `distanceKm` is the rig's **Distance** reading (km) at the time performed
 * (CONTEXT.md, issue #32): a whole, non-negative kilometre count, the anchor a
 * distance-based Interval's next due is measured from. Optional — absent means
 * the completion recorded no reading (a distance task then reads `reading-needed`).
 *
 * `costCents` is what the task cost (issue #39): an integer count of cents
 * (mechanic labour, parts, consumables). Optional — absent means no cost was
 * recorded. The UI shows decimal dollars; storage is always integer cents.
 *
 * `comment` is a short free-text note about the completion (issue #101) —
 * findings, an unusual observation, the method used. Multi-line, at most 500
 * characters. Optional — absent means "no comment"; an empty string is never
 * stored, so absence is the only "no comment" shape.
 */
export const LogEntrySchema = z.object({
  id: IdSchema,
  taskId: IdSchema.nullable(),
  rigId: IdSchema,
  taskName: z.string().min(1),
  performedOn: IsoDateSchema,
  distanceKm: z.number().int().nonnegative().optional(),
  costCents: z.number().int().nonnegative().optional(),
  comment: z.string().min(1).max(LOG_ENTRY_COMMENT_MAX_LENGTH).optional(),
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
 * Create body — `id` is server-assigned, and both `rigId` and `taskName` are
 * derived server-side from the task the entry names (an entry can never land on
 * a rig its task doesn't belong to, and the name snapshot must reflect the task
 * as the server sees it, not a value the client could forge), so the client
 * names only the task, the date, and the field snapshot.
 *
 * `taskId` is nullable on {@link LogEntrySchema} (a kept entry whose task since
 * deleted, issue #28), but creating an entry always logs against a *live* task,
 * so the create body re-requires a real, non-null `taskId`.
 */
export const CreateLogEntrySchema = LogEntrySchema.omit({
  id: true,
  rigId: true,
  taskName: true,
}).extend({ taskId: IdSchema });
export type CreateLogEntry = z.infer<typeof CreateLogEntrySchema>;

/** The create body with an optional client-generated `id` — see {@link CreateRigWithIdSchema} (issue #143). */
export const CreateLogEntryWithIdSchema = CreateLogEntrySchema.extend({
  id: IdSchema.optional(),
});
export type CreateLogEntryWithId = z.infer<typeof CreateLogEntryWithIdSchema>;

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

/**
 * Edit body — a past entry stays editable (correct a date or a value). The
 * snapshotted `taskName` is deliberately absent: renaming happens on the task,
 * and the entry's frozen name (issue #27) is never rewritten through an edit.
 * `distanceKm` is additionally nullable: an explicit `null` clears a recorded
 * Distance reading (issue #32), while an omitted key leaves it unchanged.
 * `costCents` follows the same nullable pattern (issue #39): `null` clears a
 * recorded cost, omitted leaves it unchanged, and `comment` follows it too
 * (issue #101): `null` clears a comment, omitted leaves it unchanged.
 */
export const UpdateLogEntrySchema = z
  .object({
    performedOn: IsoDateSchema,
    distanceKm: z.number().int().nonnegative().nullable(),
    costCents: z.number().int().nonnegative().nullable(),
    comment: z.string().min(1).max(LOG_ENTRY_COMMENT_MAX_LENGTH).nullable(),
    fields: LogEntrySchema.shape.fields,
  })
  .partial();
export type UpdateLogEntry = z.infer<typeof UpdateLogEntrySchema>;

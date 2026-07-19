import { z } from 'zod';

/**
 * Custom fields on maintenance tasks and plain checklist steps (ADR-0004, ADR-0008).
 *
 * `photo` exists in the *shape* (ADR-0007) but is **rejected by validation** until the
 * post-MVP effort lands (ADR-0010) — it is deliberately not half-supported.
 */

/** Every field type the wire shape knows about, including the deferred `photo`. */
export const FIELD_TYPES = [
  'text',
  'note',
  'number',
  'boolean',
  'date',
  'photo',
] as const;

/** Field types validation accepts today — `photo` is excluded (ADR-0010). */
export const SUPPORTED_FIELD_TYPES = [
  'text',
  'note',
  'number',
  'boolean',
  'date',
] as const;

export const FieldTypeSchema = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof FieldTypeSchema>;

export type SupportedFieldType = (typeof SUPPORTED_FIELD_TYPES)[number];

/** True for a field type usable in the MVP; false for `photo` and anything unknown. */
export function isSupportedFieldType(type: string): type is SupportedFieldType {
  return (SUPPORTED_FIELD_TYPES as readonly string[]).includes(type);
}

/**
 * The bare object shape of a field definition, with no `photo`-rejection refinement.
 * Exported so snapshots (log-entry fields, run-step values) can `.extend` it.
 */
export const FieldDefinitionBaseSchema = z.object({
  name: z.string().min(1),
  type: FieldTypeSchema,
  required: z.boolean(),
  unit: z.string().min(1).optional(),
});

/** True unless the field carries the deferred `photo` type (ADR-0010). */
export function isSupportedField(field: { readonly type: string }): boolean {
  return isSupportedFieldType(field.type);
}

/** True unless a `unit` sits on a non-number field — `unit` is number-only (ADR-0004). */
export function isUnitOnlyOnNumber(field: {
  readonly type: string;
  readonly unit?: string | undefined;
}): boolean {
  return field.unit === undefined || field.type === 'number';
}

export const PHOTO_FIELD_ISSUE = {
  message: '`photo` fields are not supported yet (ADR-0010)',
  path: ['type'],
};

export const UNIT_ONLY_ON_NUMBER_ISSUE = {
  message: 'a unit is meaningful only on a number field (ADR-0004)',
  path: ['unit'],
};

/**
 * One custom-field definition. `photo` is rejected (ADR-0010) and `unit` is meaningful only
 * for `number` (ADR-0004). The same two rules apply to a snapshotted log-entry field, so
 * the predicates and issue objects are exported for reuse.
 */
export const FieldDefinitionSchema = FieldDefinitionBaseSchema.refine(
  isSupportedField,
  PHOTO_FIELD_ISSUE,
).refine(isUnitOnlyOnNumber, UNIT_ONLY_ON_NUMBER_ISSUE);
export type FieldDefinition = z.infer<typeof FieldDefinitionSchema>;

/** A recorded value, stored as its native JSON type (ADR-0004). */
export const FieldValueSchema = z.union([z.string(), z.number(), z.boolean()]);
export type FieldValue = z.infer<typeof FieldValueSchema>;

/**
 * The duplicate field names in a list, each paired with the index of the *offending*
 * (second-or-later) occurrence — so a Zod issue points at the duplicate, not the original.
 * Shared by the task/step `field_schema` and the log-entry snapshot, which enforce the
 * same uniqueness (ADR-0004).
 */
export function duplicateFieldNameIssues(
  fields: readonly { readonly name: string }[],
): { readonly name: string; readonly index: number }[] {
  const seen = new Set<string>();
  const issues: { name: string; index: number }[] = [];
  for (const [index, field] of fields.entries()) {
    if (seen.has(field.name)) {
      issues.push({ name: field.name, index });
    }
    seen.add(field.name);
  }
  return issues;
}

/** A task's / step's whole `field_schema`: definitions with names unique within it. */
export const FieldSchemaSchema = z
  .array(FieldDefinitionSchema)
  .superRefine((fields, ctx) => {
    for (const { name, index } of duplicateFieldNameIssues(fields)) {
      ctx.addIssue({
        code: 'custom',
        message: `duplicate field name: ${name}`,
        path: [index, 'name'],
      });
    }
  });
export type FieldSchema = z.infer<typeof FieldSchemaSchema>;

/** Result of a pure validation pass — app-enforced, since JSONB can't constrain (ADR-0004). */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const ok: ValidationResult = { valid: true, errors: [] };

/** Names that appear more than once, each reported once, in first-seen order. */
export function findDuplicateFieldNames(
  fields: readonly { readonly name: string }[],
): string[] {
  return [...new Set(duplicateFieldNameIssues(fields).map((i) => i.name))];
}

/**
 * Validate a raw `field_schema`: every type must be supported (rejecting `photo` and
 * unknown types) and names must be unique within the task/step (ADR-0004).
 */
export function validateFieldSchema(
  fields: readonly {
    readonly name: string;
    readonly type: string;
    readonly required: boolean;
    readonly unit?: string;
  }[],
): ValidationResult {
  const errors: string[] = [];
  for (const field of fields) {
    if (!isSupportedFieldType(field.type)) {
      errors.push(`field "${field.name}" has unsupported type "${field.type}"`);
    }
  }
  for (const name of findDuplicateFieldNames(fields)) {
    errors.push(`duplicate field name: ${name}`);
  }
  return errors.length === 0 ? ok : { valid: false, errors };
}

/** A recorded value keyed by field name, captured onto a run step or log entry. */
export const RecordedFieldValueSchema = z.object({
  name: z.string().min(1),
  value: FieldValueSchema,
});

/** A recorded value for a named field, captured onto a run step or log entry. */
export interface RecordedFieldValue {
  readonly name: string;
  readonly value: unknown;
}

function isBlank(value: unknown): boolean {
  // Nullish coalescing folds both `undefined` and `null` to '', so all three read as blank
  // while `0` and `false` stay meaningful values.
  return (value ?? '') === '';
}

/**
 * Enforce `required`: every required field in the schema must have a non-blank recorded
 * value. Optional fields may be absent.
 */
export function validateFieldValues(
  schema: readonly FieldDefinition[],
  values: readonly RecordedFieldValue[],
): ValidationResult {
  const byName = new Map(values.map((v) => [v.name, v.value]));
  const errors: string[] = [];
  for (const field of schema) {
    if (field.required && isBlank(byName.get(field.name))) {
      errors.push(`required field "${field.name}" is missing a value`);
    }
  }
  return errors.length === 0 ? ok : { valid: false, errors };
}

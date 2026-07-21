import { z } from 'zod';
import { IdSchema } from './common.js';
import { FieldSchemaSchema } from './field-schema.js';

/**
 * An Interval — the optional recurrence period on a maintenance task (CONTEXT.md). Drives
 * due/overdue, computed on read (ADR-0005). Seed intervals are whole months.
 */
export const IntervalSchema = z.object({
  months: z.number().int().positive(),
});
export type Interval = z.infer<typeof IntervalSchema>;

/**
 * A Maintenance Task — a recurring upkeep job on a rig (CONTEXT.md). No interval ⇒ not
 * tracked for due-status. Owns its own `field_schema` (ADR-0004); may be referenced by
 * steps on any number of checklists or performed standalone.
 */
export const MaintenanceTaskSchema = z.object({
  id: IdSchema,
  rigId: IdSchema,
  name: z.string().min(1),
  interval: IntervalSchema.optional(),
  fieldSchema: FieldSchemaSchema,
});
export type MaintenanceTask = z.infer<typeof MaintenanceTaskSchema>;

/** Create body — `id` is server-assigned; the field schema defaults to empty. */
export const CreateMaintenanceTaskSchema = z.object({
  rigId: IdSchema,
  name: z.string().min(1),
  interval: IntervalSchema.optional(),
  fieldSchema: FieldSchemaSchema.default([]),
});
export type CreateMaintenanceTask = z.infer<typeof CreateMaintenanceTaskSchema>;

/**
 * Edit body — any subset of the editable fields (rig membership never changes).
 * An explicit `interval: null` removes the interval, so the task stops being
 * tracked for due-status; an omitted `interval` leaves it unchanged.
 */
export const UpdateMaintenanceTaskSchema = z
  .object({
    name: z.string().min(1),
    interval: IntervalSchema.nullable(),
    fieldSchema: FieldSchemaSchema,
  })
  .partial();
export type UpdateMaintenanceTask = z.infer<typeof UpdateMaintenanceTaskSchema>;

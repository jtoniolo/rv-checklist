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
 * A Maintenance Task — an upkeep job on a rig (CONTEXT.md). A task is tracked
 * for due-status one of two mutually exclusive ways, or not at all:
 *
 * - a recurring task carries an `interval` and is due on its recurrence;
 * - a **one-time** task carries `oneTime: true` and is due from the moment it's
 *   created — noticed once and done once (issue #29); completing it deletes it;
 * - a task with neither is simply not tracked.
 *
 * A one-time task and an interval are exclusive: `oneTime` never rides with an
 * `interval`. Owns its own `field_schema` (ADR-0004); may be referenced by steps
 * on any number of checklists or performed standalone (a one-time task is
 * standalone only — never linked to a step).
 *
 * `description` is optional free text (multi-line): why the task needs doing
 * and how to perform it (issue #25). Absent means absent — blank (empty or
 * whitespace-only) is rejected so no placeholder is ever stored.
 */

/** Trimmed, non-blank free text — the description's shape wherever it appears. */
const DescriptionSchema = z.string().trim().min(1);

/**
 * The one-time marker (issue #29). Present ⇒ `true` (due-from-creation, done
 * once); absent ⇒ not one-time — the same absent-means-absent shape the other
 * optional markers use, so no `false` is ever stored.
 */
const OneTimeSchema = z.literal(true);

/**
 * The invariant guard: a one-time task never also carries an interval (issue
 * #29) — the two are exclusive ways of being tracked. Neither is fine (untracked).
 */
function isIntervalOneTimeExclusive(task: {
  readonly interval?: unknown;
  readonly oneTime?: unknown;
}): boolean {
  return task.oneTime !== true || task.interval === undefined;
}
const ONE_TIME_INTERVAL_ISSUE = {
  message: 'a one-time task has no interval',
  path: ['oneTime'],
};

export const MaintenanceTaskSchema = z
  .object({
    id: IdSchema,
    rigId: IdSchema,
    name: z.string().min(1),
    description: DescriptionSchema.optional(),
    interval: IntervalSchema.optional(),
    oneTime: OneTimeSchema.optional(),
    fieldSchema: FieldSchemaSchema,
  })
  .refine(isIntervalOneTimeExclusive, ONE_TIME_INTERVAL_ISSUE);
export type MaintenanceTask = z.infer<typeof MaintenanceTaskSchema>;

/** Create body — `id` is server-assigned; the field schema defaults to empty. */
export const CreateMaintenanceTaskSchema = z
  .object({
    rigId: IdSchema,
    name: z.string().min(1),
    description: DescriptionSchema.optional(),
    interval: IntervalSchema.optional(),
    oneTime: OneTimeSchema.optional(),
    fieldSchema: FieldSchemaSchema.default([]),
  })
  .refine(isIntervalOneTimeExclusive, ONE_TIME_INTERVAL_ISSUE);
export type CreateMaintenanceTask = z.infer<typeof CreateMaintenanceTaskSchema>;

/**
 * Edit body — any subset of the editable fields (rig membership never changes).
 * An explicit `null` removes an optional field — `interval: null` stops
 * due-status tracking, `oneTime: null` clears the one-time marker, `description:
 * null` clears the description — while an omitted key leaves the field
 * unchanged. `interval` and `oneTime` stay mutually exclusive: the service drops
 * whichever the edit didn't set when a change would otherwise leave both.
 */
export const UpdateMaintenanceTaskSchema = z
  .object({
    name: z.string().min(1),
    description: DescriptionSchema.nullable(),
    interval: IntervalSchema.nullable(),
    oneTime: OneTimeSchema.nullable(),
    fieldSchema: FieldSchemaSchema,
  })
  .partial();
export type UpdateMaintenanceTask = z.infer<typeof UpdateMaintenanceTaskSchema>;

import { z } from 'zod';
import { IdSchema, IsoDateSchema } from './common.js';
import { FieldSchemaSchema } from './field-schema.js';

/**
 * An Interval — the optional recurrence period on a maintenance task (CONTEXT.md),
 * carrying up to two **limits** (ADR-0016): an optional **calendar** cadence
 * (`months`) and an optional **distance** cadence (`km`). It is one object, no
 * longer a tagged union on `basis`: the two limits coexist so a task can read
 * "every 12 months or 20,000 km, whichever comes first".
 *
 * - **months** — a whole, positive count of calendar months, anchored off when
 *   the task was last performed (and any manual `lastPerformed` anchor);
 * - **km** — a whole, positive count of kilometres (issue #32), anchored solely
 *   off the rig's Distance reading logged when the task was last performed.
 *
 * **At least one limit must be present** — an interval with neither is not an
 * interval (the task is untracked, the same as no interval at all). Due/overdue
 * is computed on read (ADR-0005), on whichever present limit elapses first.
 */
export const IntervalSchema = z
  .object({
    months: z.number().int().positive().optional(),
    km: z.number().int().positive().optional(),
  })
  .refine((interval) => hasLimit(interval), {
    message: 'an interval needs a months or km limit',
  });
export type Interval = z.infer<typeof IntervalSchema>;

/** Whether an interval carries at least one limit — the "not empty" invariant. */
function hasLimit(interval: {
  readonly months?: unknown;
  readonly km?: unknown;
}): boolean {
  return interval.months !== undefined || interval.km !== undefined;
}

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
 *
 * `lastPerformed` is the optional **manual** last-performed date (issue #33):
 * an owner's hand-set anchor for an interval's **calendar limit**, needing no Log
 * Entry — a task done before the app, a seasonal task anchored to its season, an
 * age-based replacement anchored to a manufacture date. It rides with any interval
 * that carries a `months` limit (whether or not it also carries a `km` limit —
 * ADR-0016), never with a distance-only interval or the one-time marker; a real
 * completion always supersedes it (the due engine takes the later of the two,
 * ADR-0015), so the owner corrects a wrong completion by editing the Log Entry,
 * never by forcing this anchor earlier.
 */

/** Trimmed, non-blank free text — the description's shape wherever it appears. */
const DescriptionSchema = z.string().trim().min(1);

/**
 * A tag in **canonical form** (issue #41, ADR-0017): trimmed and lowercased, so
 * "Tires" and "tires" are the same tag. Canonical form is what gets stored,
 * end-to-end — no display form that diverges. The transform canonicalises on the
 * way in; the pipe rejects empty strings after the transform.
 */
const TagSchema = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(z.string().min(1));

/**
 * An optional set of tags on a maintenance task (issue #41). Tags are
 * case-insensitive, stored in canonical form, and unique within the set.
 * The array defaults to `[]` — a task with no tags simply has an empty array.
 */
export const TagsSchema = z
  .array(TagSchema)
  .refine((tags) => new Set(tags).size === tags.length, {
    message: 'tags must be unique after canonicalisation',
  });
export type Tags = z.infer<typeof TagsSchema>;

/**
 * Canonicalise a user-entered tag: trim + lowercase. The UI uses this to check
 * whether a typed tag already exists before adding it (issue #41).
 */
export function canonicalizeTag(raw: string): string {
  return raw.trim().toLowerCase();
}

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

/**
 * The invariant guard: a manual `lastPerformed` anchor rides only with an
 * interval that carries a **calendar limit** (issue #33, ADR-0016) — a
 * distance-only interval anchors solely off a logged Distance reading (ADR-0015),
 * and an untracked or one-time task has no interval to anchor. A combined
 * interval carries a calendar limit, so it accepts an anchor. Absent
 * `lastPerformed` is always fine.
 */
function isLastPerformedCalendarOnly(task: {
  readonly interval?: { readonly months?: unknown } | undefined;
  readonly lastPerformed?: unknown;
}): boolean {
  return (
    task.lastPerformed === undefined || task.interval?.months !== undefined
  );
}
const LAST_PERFORMED_CALENDAR_ISSUE = {
  message: 'last performed only anchors a calendar limit',
  path: ['lastPerformed'],
};

export const MaintenanceTaskSchema = z
  .object({
    id: IdSchema,
    rigId: IdSchema,
    name: z.string().min(1),
    description: DescriptionSchema.optional(),
    interval: IntervalSchema.optional(),
    oneTime: OneTimeSchema.optional(),
    lastPerformed: IsoDateSchema.optional(),
    fieldSchema: FieldSchemaSchema,
    tags: TagsSchema.default([]),
  })
  .refine(isIntervalOneTimeExclusive, ONE_TIME_INTERVAL_ISSUE)
  .refine(isLastPerformedCalendarOnly, LAST_PERFORMED_CALENDAR_ISSUE);
export type MaintenanceTask = z.infer<typeof MaintenanceTaskSchema>;

/** Create body — `id` is server-assigned; the field schema defaults to empty. */
export const CreateMaintenanceTaskSchema = z
  .object({
    rigId: IdSchema,
    name: z.string().min(1),
    description: DescriptionSchema.optional(),
    interval: IntervalSchema.optional(),
    oneTime: OneTimeSchema.optional(),
    lastPerformed: IsoDateSchema.optional(),
    fieldSchema: FieldSchemaSchema.default([]),
    tags: TagsSchema.default([]),
  })
  .refine(isIntervalOneTimeExclusive, ONE_TIME_INTERVAL_ISSUE)
  .refine(isLastPerformedCalendarOnly, LAST_PERFORMED_CALENDAR_ISSUE);
export type CreateMaintenanceTask = z.infer<typeof CreateMaintenanceTaskSchema>;

/**
 * Edit body — any subset of the editable fields (rig membership never changes).
 * An explicit `null` removes an optional field — `interval: null` stops
 * due-status tracking, `oneTime: null` clears the one-time marker, `description:
 * null` clears the description, `lastPerformed: null` clears the manual anchor
 * (issue #33) — while an omitted key leaves the field unchanged. `interval` and
 * `oneTime` stay mutually exclusive: the service drops whichever the edit didn't
 * set when a change would otherwise leave both. `lastPerformed` anchors a
 * calendar interval only, so the service also drops it when a change leaves the
 * task without one — the calendar-only invariant the full schema guards.
 */
export const UpdateMaintenanceTaskSchema = z
  .object({
    name: z.string().min(1),
    description: DescriptionSchema.nullable(),
    interval: IntervalSchema.nullable(),
    oneTime: OneTimeSchema.nullable(),
    lastPerformed: IsoDateSchema.nullable(),
    fieldSchema: FieldSchemaSchema,
    tags: TagsSchema,
  })
  .partial();
export type UpdateMaintenanceTask = z.infer<typeof UpdateMaintenanceTaskSchema>;

import { z } from 'zod';
import { AttachmentSchema } from './attachment.js';
import { IdSchema, IsoDateSchema } from './common.js';

/**
 * A Stop — one ordered overnight halt on a trip (CONTEXT.md, issue #111): the
 * one-stop shop for arrival, holding what would otherwise be dug out of emails.
 * Everything beyond identity, order, and the arrived flag is optional. The
 * location is free text (`campground`) plus an optional Google place ID —
 * there is no reusable place record; a place-details pre-fill of `address` and
 * `phone` becomes the owner's own data the moment it is stored (ADR-0025).
 *
 * `legKm` is the distance in whole km driven into this stop from the previous
 * stop or the trip's starting point — always the owner's editable figure,
 * whether typed by hand or pre-filled from the maps proxy (which rounds to the
 * nearest 5 km, ADR-0025). Marking the stop arrived logs it onto the rig's
 * Distance. `checkInTime` / `checkOutTime` are free text: nothing computes on
 * them, so "after 2pm" is as valid as "14:00". `costCents` is the house cents
 * pattern (see `log-entry.ts`).
 */
export const StopSchema = z.object({
  id: IdSchema,
  tripId: IdSchema,
  position: z.number().int().nonnegative(),
  arrived: z.boolean(),
  campground: z.string().min(1).optional(),
  placeId: z.string().min(1).optional(),
  campsite: z.string().min(1).optional(),
  arrivalDate: IsoDateSchema.optional(),
  nights: z.number().int().positive().optional(),
  checkInTime: z.string().min(1).optional(),
  checkOutTime: z.string().min(1).optional(),
  bookingNumber: z.string().min(1).optional(),
  costCents: z.number().int().nonnegative().optional(),
  address: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  notes: z.string().min(1).optional(),
  legKm: z.number().int().nonnegative().optional(),
});
export type Stop = z.infer<typeof StopSchema>;

/**
 * A stop as it is read over the wire: the stored stop plus its attachments'
 * metadata (ADR-0026 — filename, type, size, map flag; the bytes stay behind
 * the download route). The array defaults to empty so payloads and fixtures
 * predating attachments keep parsing.
 */
export const StopReadSchema = StopSchema.extend({
  attachments: z.array(AttachmentSchema).default([]),
});
export type StopRead = z.infer<typeof StopReadSchema>;

/**
 * A Trip — a named journey of a rig from an explicitly set starting point
 * through an ordered sequence of stops (CONTEXT.md). One-way: it ends wherever
 * its last stop is. The starting point has the same shape as a stop's location
 * (free text + optional place ID, ADR-0025). `checklistIds` is the many-to-many
 * grouping of convenience with checklists, denormalized as a plain id array
 * (ADR-0017's reasoning: the link has no metadata and no cross-rig queries).
 * Status (planned / underway / completed) is derived by {@link tripStatus},
 * never stored.
 */
export const TripSchema = z.object({
  id: IdSchema,
  rigId: IdSchema,
  name: z.string().min(1),
  startLocation: z.string().min(1).optional(),
  startPlaceId: z.string().min(1).optional(),
  checklistIds: z.array(IdSchema),
});
export type Trip = z.infer<typeof TripSchema>;

/** Trip status — derived from which stops are arrived, never stored (CONTEXT.md). */
export const TripStatusSchema = z.enum(['planned', 'underway', 'completed']);
export type TripStatus = z.infer<typeof TripStatusSchema>;

/**
 * A trip as it is read over the wire: the stored trip plus its ordered stops
 * and the derived {@link tripStatus} — so every trip read carries enough to
 * render a trip card without a second request.
 */
export const TripReadSchema = TripSchema.extend({
  stops: z.array(StopReadSchema),
  status: TripStatusSchema,
});
export type TripRead = z.infer<typeof TripReadSchema>;

/**
 * Edit body — any subset of the editable fields (rig membership never
 * changes). The start point fields are additionally nullable: an explicit
 * `null` clears one, an omitted key leaves it unchanged (the house
 * clear-vs-omit semantics, see `UpdateLogEntrySchema`). `checklistIds`
 * replaces the whole set, like a task's tags.
 */
export const UpdateTripSchema = z
  .object({
    name: z.string().min(1),
    startLocation: z.string().min(1).nullable(),
    startPlaceId: z.string().min(1).nullable(),
    checklistIds: z.array(IdSchema),
  })
  .partial();
export type UpdateTrip = z.infer<typeof UpdateTripSchema>;

/**
 * Create body — the client names the trip and any detail fields. `position`
 * is server-owned (a new stop appends at the end; reordering is its own
 * operation) and `arrived` is server-owned too (arrival is an explicit
 * operation with Distance side effects), so neither is accepted here.
 */
export const CreateStopSchema = StopSchema.omit({
  id: true,
  position: true,
  arrived: true,
});
export type CreateStop = z.infer<typeof CreateStopSchema>;

/**
 * A stop as it rides inside a trip create body (issue #120): the stop create
 * body minus `tripId` — the server knows which trip it is creating. Derived
 * from {@link CreateStopSchema} so a new stop field flows through here
 * automatically.
 */
export const CreateTripStopSchema = CreateStopSchema.omit({ tripId: true });
export type CreateTripStop = z.infer<typeof CreateTripStopSchema>;

/**
 * Create body — `id` is server-assigned; an omitted `checklistIds` is simply
 * empty. `stops` are the trip's initial stops, written atomically with the
 * trip in one request (issue #120); the server assigns positions 0..n-1 in
 * array order and every initial stop starts un-arrived. An empty `stops` stays
 * valid on the wire (the MCP `create_trip` tool shares this schema) — the web
 * form, not the server, enforces the at-least-one-stop rule.
 */
export const CreateTripSchema = TripSchema.omit({ id: true }).extend({
  checklistIds: z.array(IdSchema).default([]),
  stops: z.array(CreateTripStopSchema).default([]),
});
export type CreateTrip = z.infer<typeof CreateTripSchema>;

/**
 * Edit body — every detail field optional (omitted = unchanged) and nullable
 * (`null` clears). `arrived` and `position` are deliberately absent: arrival
 * (with its Distance side effects) and reordering are explicit operations,
 * never a side door through a plain edit.
 */
export const UpdateStopSchema = z
  .object({
    campground: z.string().min(1).nullable(),
    placeId: z.string().min(1).nullable(),
    campsite: z.string().min(1).nullable(),
    arrivalDate: IsoDateSchema.nullable(),
    nights: z.number().int().positive().nullable(),
    checkInTime: z.string().min(1).nullable(),
    checkOutTime: z.string().min(1).nullable(),
    bookingNumber: z.string().min(1).nullable(),
    costCents: z.number().int().nonnegative().nullable(),
    address: z.string().min(1).nullable(),
    phone: z.string().min(1).nullable(),
    notes: z.string().min(1).nullable(),
    legKm: z.number().int().nonnegative().nullable(),
  })
  .partial();
export type UpdateStop = z.infer<typeof UpdateStopSchema>;

/**
 * Body of the explicit arrival operation: `true` marks the stop arrived
 * (logging its leg onto the rig's Distance), `false` un-arrives it (backing
 * the leg out again). Idempotent — setting the flag to its current value
 * changes nothing.
 */
export const SetStopArrivedSchema = z.object({ arrived: z.boolean() });
export type SetStopArrived = z.infer<typeof SetStopArrivedSchema>;

/** Body of the reorder operation: the stop's new zero-based position on its trip. */
export const ReorderStopSchema = z.object({
  position: z.number().int().nonnegative(),
});
export type ReorderStop = z.infer<typeof ReorderStopSchema>;

/**
 * Derive a trip's status from which stops are arrived (CONTEXT.md — derived,
 * never stored): planned while nothing is arrived (including zero stops),
 * underway once some stop is, completed when every stop is (and there is at
 * least one).
 */
export function tripStatus(
  stops: readonly { readonly arrived: boolean }[],
): TripStatus {
  const arrivedCount = stops.filter((stop) => stop.arrived).length;
  if (arrivedCount === 0) return 'planned';
  return arrivedCount === stops.length ? 'completed' : 'underway';
}

/** The stops a {@link currentTrip} candidate must carry — order, arrival, and date. */
interface CurrentTripStop {
  readonly position: number;
  readonly arrived: boolean;
  readonly arrivalDate?: string;
}

/** A trip's start date: its first stop's (lowest position) arrival date, if any. */
function startDate(stops: readonly CurrentTripStop[]): string | undefined {
  let first: CurrentTripStop | undefined;
  for (const stop of stops) {
    if (first === undefined || stop.position < first.position) first = stop;
  }
  return first?.arrivalDate;
}

/**
 * Derive the Current trip (CONTEXT.md — derived, never stored): the underway
 * trip if one exists, otherwise the planned trip with the earliest start (its
 * first stop's arrival date; an undated planned trip sorts after every dated
 * one but still surfaces when nothing dated exists). Completed trips are never
 * current; no underway and no planned trips means no current trip.
 */
export function currentTrip<
  T extends { readonly stops: readonly CurrentTripStop[] },
>(trips: readonly T[]): T | undefined {
  const underway = trips.find((trip) => tripStatus(trip.stops) === 'underway');
  if (underway) return underway;

  let best: T | undefined;
  let bestStart: string | undefined;
  for (const trip of trips) {
    if (tripStatus(trip.stops) !== 'planned') continue;
    const start = startDate(trip.stops);
    const isBetter =
      best === undefined ||
      (start !== undefined && (bestStart === undefined || start < bestStart));
    if (isBetter) {
      best = trip;
      bestStart = start;
    }
  }
  return best;
}

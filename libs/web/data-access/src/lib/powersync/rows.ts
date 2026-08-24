import type {
  Attachment,
  AttachmentMimeType,
  Checklist,
  EquipmentItem,
  FieldSchema,
  LoggedField,
  LogEntry,
  MaintenanceTask,
  Owner,
  Rig,
  Run,
  RunStep,
  Step,
  Stop,
  Trip,
} from '@rv-checklist/domain';
import type { LocalRow } from './tables.js';

/**
 * Row-to-wire projections for the ten synced tables (ADR-0029). Each one
 * produces exactly what the matching REST read returns, so a watch emission
 * and a network response are interchangeable in the RTK Query cache.
 *
 * These are the only place the local column names appear next to the wire
 * field names, and every non-mechanical rename lives here: `at_distance_km`
 * becomes `distanceKm`, a task's `interval` is assembled from two columns,
 * `one_time` false disappears rather than becoming `false`, and a task's NULL
 * `tags` array reads as `[]` — all matching the API repositories.
 *
 * Nothing here joins or computes: values the API derives on read are stitched
 * by the callers in `queries.ts` (a trip's stops and status) or stay
 * network-only. The conditional spreads keep optional keys absent rather than
 * present-and-undefined, which is what the domain schemas require.
 */

/** A `jsonb` or Postgres-array column, which PowerSync stores as JSON text. */
function jsonArray<Item>(value: string | null): Item[] {
  if (value === null) return [];
  const parsed: unknown = JSON.parse(value);
  return Array.isArray(parsed) ? (parsed as Item[]) : [];
}

/** PowerSync stores a Postgres boolean as a 0/1 integer. */
function isTrue(value: number | null): boolean {
  return value === 1;
}

export function toOwner(row: LocalRow<'users'>): Owner {
  return {
    id: row.id,
    email: row.email,
    ...(row.name !== null && { name: row.name }),
    ...(row.picture !== null && { picture: row.picture }),
  };
}

export function toRig(row: LocalRow<'rigs'>): Rig {
  return {
    id: row.id,
    ownerId: row.owner_id,
    nickname: row.nickname,
    ...(row.vin !== null && { vin: row.vin }),
    ...(row.make !== null && { make: row.make }),
    ...(row.model !== null && { model: row.model }),
    ...(row.year !== null && { year: row.year }),
    ...(row.distance_km !== null && { distanceKm: row.distance_km }),
    ...(row.travel_height_mm !== null && {
      travelHeightMm: row.travel_height_mm,
    }),
    ...(row.length_mm !== null && { lengthMm: row.length_mm }),
    ...(row.combined_length_mm !== null && {
      combinedLengthMm: row.combined_length_mm,
    }),
    ...(row.clearance_passenger_mm !== null && {
      clearancePassengerMm: row.clearance_passenger_mm,
    }),
    ...(row.clearance_driver_mm !== null && {
      clearanceDriverMm: row.clearance_driver_mm,
    }),
  };
}

export function toEquipmentItem(
  row: LocalRow<'equipment_items'>,
): EquipmentItem {
  return {
    id: row.id,
    rigId: row.rig_id,
    name: row.name,
    ...(row.make !== null && { make: row.make }),
    ...(row.model !== null && { model: row.model }),
    ...(row.purchase_date !== null && { purchaseDate: row.purchase_date }),
    ...(row.notes !== null && { notes: row.notes }),
    ...(row.cost_cents !== null && { costCents: row.cost_cents }),
  };
}

export function toChecklist(row: LocalRow<'checklists'>): Checklist {
  return {
    id: row.id,
    rigId: row.rig_id,
    name: row.name,
    tags: jsonArray<string>(row.tags),
    steps: jsonArray<Step>(row.steps),
  };
}

export function toRun(row: LocalRow<'runs'>): Run {
  return {
    id: row.id,
    checklistId: row.checklist_id,
    rigId: row.rig_id,
    startedOn: row.started_on,
    steps: jsonArray<RunStep>(row.steps),
    ...(row.trip_id !== null && { tripId: row.trip_id }),
  };
}

export function toMaintenanceTask(
  row: LocalRow<'maintenance_tasks'>,
): MaintenanceTask {
  const hasInterval = row.interval_months !== null || row.interval_km !== null;
  return {
    id: row.id,
    rigId: row.rig_id,
    name: row.name,
    fieldSchema: jsonArray<FieldSchema[number]>(row.field_schema),
    tags: jsonArray<string>(row.tags),
    ...(row.description !== null && { description: row.description }),
    ...(hasInterval && {
      interval: {
        ...(row.interval_months !== null && { months: row.interval_months }),
        ...(row.interval_km !== null && { km: row.interval_km }),
      },
    }),
    // `oneTime` is `z.literal(true)`: a false column means the key is absent.
    ...(isTrue(row.one_time) && { oneTime: true as const }),
    ...(row.last_performed !== null && { lastPerformed: row.last_performed }),
  };
}

export function toLogEntry(row: LocalRow<'log_entries'>): LogEntry {
  return {
    id: row.id,
    // Nullable on the wire, not optional — a kept entry whose task was deleted.
    taskId: row.task_id,
    rigId: row.rig_id,
    taskName: row.task_name,
    performedOn: row.performed_on,
    fields: jsonArray<LoggedField>(row.fields),
    ...(row.at_distance_km !== null && { distanceKm: row.at_distance_km }),
    ...(row.cost_cents !== null && { costCents: row.cost_cents }),
    ...(row.comment !== null && { comment: row.comment }),
  };
}

/** The stored trip, without the stops and status the read model adds. */
export function toTrip(row: LocalRow<'trips'>): Trip {
  return {
    id: row.id,
    rigId: row.rig_id,
    name: row.name,
    checklistIds: jsonArray<string>(row.checklist_ids),
    ...(row.start_location !== null && { startLocation: row.start_location }),
    ...(row.start_place_id !== null && { startPlaceId: row.start_place_id }),
  };
}

/** The stop without its attachments — `rig_id` is dropped, as on the wire. */
export function toStop(row: LocalRow<'stops'>): Stop {
  return {
    id: row.id,
    tripId: row.trip_id,
    position: row.position,
    arrived: isTrue(row.arrived),
    ...(row.campground !== null && { campground: row.campground }),
    ...(row.place_id !== null && { placeId: row.place_id }),
    ...(row.campsite !== null && { campsite: row.campsite }),
    ...(row.arrival_date !== null && { arrivalDate: row.arrival_date }),
    ...(row.nights !== null && { nights: row.nights }),
    ...(row.check_in_time !== null && { checkInTime: row.check_in_time }),
    ...(row.check_out_time !== null && { checkOutTime: row.check_out_time }),
    ...(row.booking_number !== null && { bookingNumber: row.booking_number }),
    ...(row.cost_cents !== null && { costCents: row.cost_cents }),
    ...(row.address !== null && { address: row.address }),
    ...(row.phone !== null && { phone: row.phone }),
    ...(row.notes !== null && { notes: row.notes }),
    ...(row.leg_km !== null && { legKm: row.leg_km }),
    ...(row.leg_km_manual !== null && {
      legKmManual: isTrue(row.leg_km_manual),
    }),
  };
}

export function toAttachment(row: LocalRow<'attachments'>): Attachment {
  return {
    id: row.id,
    stopId: row.stop_id,
    filename: row.filename,
    // The column is plain text; the enum is enforced on write, as in the API.
    mimeType: row.mime_type as AttachmentMimeType,
    sizeBytes: row.size_bytes,
    isCampgroundMap: isTrue(row.is_campground_map),
  };
}

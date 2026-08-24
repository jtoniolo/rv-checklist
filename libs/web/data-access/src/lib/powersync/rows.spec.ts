/* eslint-disable unicorn/no-null -- these are rows exactly as SQLite hands
   them back, and an absent column is a SQL NULL, not `undefined`. */
import {
  AttachmentSchema,
  ChecklistSchema,
  EquipmentItemSchema,
  LogEntrySchema,
  MaintenanceTaskSchema,
  RigSchema,
  RunSchema,
  StopSchema,
  TripSchema,
} from '@rv-checklist/domain';
import {
  toAttachment,
  toChecklist,
  toEquipmentItem,
  toLogEntry,
  toMaintenanceTask,
  toRig,
  toRun,
  toStop,
  toTrip,
} from './rows.js';
import type { LocalRow } from './tables.js';

/**
 * The row-to-wire projections (ADR-0029). Each case asserts two things: the
 * exact wire object, and that it satisfies the domain schema the endpoint's
 * `transformResponse` parses a network response with — that pairing is what
 * makes a watch emission and a REST response interchangeable in the cache.
 *
 * The rows are written as PowerSync delivers them: booleans as 0/1 integers,
 * `jsonb` and Postgres arrays as JSON text, dates as `YYYY-MM-DD` text.
 */

const rigId = '550e8400-e29b-41d4-a716-446655440010';
const ownerId = '550e8400-e29b-41d4-a716-446655440001';
const createdAt = '2026-08-01 10:00:00.000Z';

describe('toRig', () => {
  const full: LocalRow<'rigs'> = {
    id: rigId,
    owner_id: ownerId,
    vin: '1FDXE4FS1234567890',
    make: 'Airstream',
    model: 'Flying Cloud',
    year: 2021,
    nickname: 'Silver Bullet',
    distance_km: 12_345,
    travel_height_mm: 3100,
    length_mm: 7600,
    combined_length_mm: 12_800,
    clearance_passenger_mm: 900,
    clearance_driver_mm: 950,
    created_at: createdAt,
  };

  it('projects every stored column onto its wire field', () => {
    const rig = toRig(full);

    expect(rig).toEqual({
      id: rigId,
      ownerId,
      vin: '1FDXE4FS1234567890',
      make: 'Airstream',
      model: 'Flying Cloud',
      year: 2021,
      nickname: 'Silver Bullet',
      distanceKm: 12_345,
      travelHeightMm: 3100,
      lengthMm: 7600,
      combinedLengthMm: 12_800,
      clearancePassengerMm: 900,
      clearanceDriverMm: 950,
    });
    expect(RigSchema.parse(rig)).toEqual(rig);
  });

  it('leaves an optional key absent rather than undefined when the column is NULL', () => {
    const rig = toRig({
      ...full,
      vin: null,
      make: null,
      model: null,
      year: null,
      distance_km: null,
      travel_height_mm: null,
      length_mm: null,
      combined_length_mm: null,
      clearance_passenger_mm: null,
      clearance_driver_mm: null,
    });

    expect(rig).toEqual({ id: rigId, ownerId, nickname: 'Silver Bullet' });
    expect(Object.keys(rig)).toEqual(['id', 'ownerId', 'nickname']);
    expect(RigSchema.parse(rig)).toEqual(rig);
  });
});

describe('toEquipmentItem', () => {
  it('projects the stored columns, dropping NULLs', () => {
    const item = toEquipmentItem({
      id: '550e8400-e29b-41d4-a716-446655440011',
      rig_id: rigId,
      name: 'Water filter',
      make: 'Camco',
      model: null,
      purchase_date: '2026-03-14',
      notes: null,
      cost_cents: 4599,
      created_at: createdAt,
    });

    expect(item).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440011',
      rigId,
      name: 'Water filter',
      make: 'Camco',
      purchaseDate: '2026-03-14',
      costCents: 4599,
    });
    expect(EquipmentItemSchema.parse(item)).toEqual(item);
  });
});

describe('toChecklist', () => {
  it('parses the jsonb tags and steps columns', () => {
    const steps = [
      { id: '550e8400-e29b-41d4-a716-446655440021', text: 'Retract awning' },
    ];
    const checklist = toChecklist({
      id: '550e8400-e29b-41d4-a716-446655440020',
      rig_id: rigId,
      name: 'Departure',
      tags: JSON.stringify(['departure']),
      steps: JSON.stringify(steps),
      created_at: createdAt,
    });

    expect(checklist).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440020',
      rigId,
      name: 'Departure',
      tags: ['departure'],
      steps,
    });
    expect(ChecklistSchema.parse(checklist)).toEqual(checklist);
  });
});

describe('toRun', () => {
  const runId = '550e8400-e29b-41d4-a716-446655440030';
  const checklistId = '550e8400-e29b-41d4-a716-446655440020';
  const base: LocalRow<'runs'> = {
    id: runId,
    checklist_id: checklistId,
    rig_id: rigId,
    trip_id: null,
    started_on: '2026-07-04',
    steps: JSON.stringify([
      {
        id: '550e8400-e29b-41d4-a716-446655440021',
        text: 'Retract awning',
        state: 'complete',
      },
    ]),
    created_at: createdAt,
  };

  it('omits tripId when the run is not linked to a trip', () => {
    const run = toRun(base);

    expect(run.tripId).toBeUndefined();
    expect('tripId' in run).toBe(false);
    expect(RunSchema.parse(run)).toEqual(run);
  });

  it('carries tripId when the column is set', () => {
    const tripId = '550e8400-e29b-41d4-a716-446655440040';
    expect(toRun({ ...base, trip_id: tripId }).tripId).toBe(tripId);
  });
});

describe('toMaintenanceTask', () => {
  const taskId = '550e8400-e29b-41d4-a716-446655440050';
  const base: LocalRow<'maintenance_tasks'> = {
    id: taskId,
    rig_id: rigId,
    name: 'Repack wheel bearings',
    description: null,
    interval_months: null,
    interval_km: null,
    one_time: 0,
    last_performed: null,
    field_schema: '[]',
    tags: null,
    created_at: createdAt,
  };

  it('assembles interval from the two columns, keeping only the limits that are set', () => {
    expect(
      toMaintenanceTask({ ...base, interval_months: 12 }).interval,
    ).toEqual({ months: 12 });
    expect(toMaintenanceTask({ ...base, interval_km: 8000 }).interval).toEqual({
      km: 8000,
    });
    expect(
      toMaintenanceTask({ ...base, interval_months: 12, interval_km: 8000 })
        .interval,
    ).toEqual({ months: 12, km: 8000 });
  });

  it('omits interval entirely when neither limit column is set', () => {
    const task = toMaintenanceTask(base);

    expect('interval' in task).toBe(false);
    expect(MaintenanceTaskSchema.parse(task)).toEqual(task);
  });

  it('drops oneTime when the column is false rather than sending false', () => {
    const recurring = toMaintenanceTask(base);
    expect('oneTime' in recurring).toBe(false);

    const oneTime = toMaintenanceTask({ ...base, one_time: 1 });
    expect(oneTime.oneTime).toBe(true);
    expect(MaintenanceTaskSchema.parse(oneTime)).toEqual(oneTime);
  });

  it('reads a NULL tags array as the empty array the wire always carries', () => {
    expect(toMaintenanceTask(base).tags).toEqual([]);
    expect(
      toMaintenanceTask({ ...base, tags: JSON.stringify(['brakes']) }).tags,
    ).toEqual(['brakes']);
  });
});

describe('toLogEntry', () => {
  const base: LocalRow<'log_entries'> = {
    id: '550e8400-e29b-41d4-a716-446655440060',
    task_id: '550e8400-e29b-41d4-a716-446655440050',
    rig_id: rigId,
    task_name: 'Repack wheel bearings',
    performed_on: '2026-05-02',
    at_distance_km: 11_000,
    cost_cents: null,
    comment: null,
    fields: '[]',
    created_at: createdAt,
  };

  it('reads distanceKm from at_distance_km, not distance_km', () => {
    const entry = toLogEntry(base);

    expect(entry.distanceKm).toBe(11_000);
    expect(LogEntrySchema.parse(entry)).toEqual(entry);
  });

  it('keeps a null taskId as null — it is nullable on the wire, not optional', () => {
    const orphaned = toLogEntry({ ...base, task_id: null });

    expect(orphaned.taskId).toBeNull();
    expect(orphaned.taskName).toBe('Repack wheel bearings');
    expect(LogEntrySchema.parse(orphaned)).toEqual(orphaned);
  });
});

describe('toTrip', () => {
  it('parses the checklist_ids array column and drops NULL start fields', () => {
    const trip = toTrip({
      id: '550e8400-e29b-41d4-a716-446655440040',
      rig_id: rigId,
      name: 'Banff',
      start_location: null,
      start_place_id: null,
      checklist_ids: JSON.stringify(['550e8400-e29b-41d4-a716-446655440020']),
      created_at: createdAt,
    });

    expect(trip).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440040',
      rigId,
      name: 'Banff',
      checklistIds: ['550e8400-e29b-41d4-a716-446655440020'],
    });
    expect(TripSchema.parse(trip)).toEqual(trip);
  });
});

describe('toStop', () => {
  const base: LocalRow<'stops'> = {
    id: '550e8400-e29b-41d4-a716-446655440070',
    trip_id: '550e8400-e29b-41d4-a716-446655440040',
    rig_id: rigId,
    position: 0,
    arrived: 0,
    campground: 'Tunnel Mountain',
    place_id: null,
    campsite: null,
    arrival_date: '2026-07-05',
    nights: 3,
    check_in_time: null,
    check_out_time: null,
    booking_number: null,
    cost_cents: null,
    address: null,
    phone: null,
    notes: null,
    leg_km: 420,
    leg_km_manual: null,
    created_at: createdAt,
  };

  it('reads 0/1 integer columns as booleans and drops rig_id', () => {
    const stop = toStop({ ...base, arrived: 1 });

    expect(stop.arrived).toBe(true);
    expect('rigId' in stop).toBe(false);
    expect(StopSchema.parse(stop)).toEqual(stop);
  });

  it('distinguishes a false leg_km_manual from an unset one', () => {
    expect(toStop({ ...base, leg_km_manual: 0 }).legKmManual).toBe(false);
    expect(toStop({ ...base, leg_km_manual: 1 }).legKmManual).toBe(true);
    expect('legKmManual' in toStop(base)).toBe(false);
  });
});

describe('toAttachment', () => {
  it('projects the metadata row and drops rig_id', () => {
    const attachment = toAttachment({
      id: '550e8400-e29b-41d4-a716-446655440080',
      stop_id: '550e8400-e29b-41d4-a716-446655440070',
      rig_id: rigId,
      filename: 'campground-map.pdf',
      mime_type: 'application/pdf',
      size_bytes: 204_800,
      is_campground_map: 1,
      created_at: createdAt,
    });

    expect(attachment).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440080',
      stopId: '550e8400-e29b-41d4-a716-446655440070',
      filename: 'campground-map.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 204_800,
      isCampgroundMap: true,
    });
    expect(AttachmentSchema.parse(attachment)).toEqual(attachment);
  });
});

/* eslint-disable unicorn/no-null -- these are rows exactly as SQLite hands
   them back, and an absent column is a SQL NULL, not `undefined`. */
import { TripReadSchema } from '@rv-checklist/domain';
import type { LocalStore } from './local-store.js';
import {
  runQuery,
  stitchTrips,
  tasksQuery,
  tripsByRigQuery,
} from './queries.js';
import type { LocalRow } from './tables.js';

/**
 * The local queries (ADR-0029) against a fake store. `listTripsByRig` gets the
 * most attention because it is the one endpoint the API assembles rather than
 * reads: the sync rules cannot join, so the stitching that produces nested
 * `TripRead`s has to be right here instead.
 */

const rigId = '550e8400-e29b-41d4-a716-446655440010';
const tripId = '550e8400-e29b-41d4-a716-446655440040';
const otherTripId = '550e8400-e29b-41d4-a716-446655440041';
const checklistId = '550e8400-e29b-41d4-a716-446655440020';
const deletedChecklistId = '550e8400-e29b-41d4-a716-446655440029';

/** A store that answers by matching the table each SQL statement reads from. */
function fakeStore(rowsByTable: Record<string, unknown[]>): {
  store: LocalStore;
  calls: { sql: string; parameters: unknown[] }[];
} {
  const calls: { sql: string; parameters: unknown[] }[] = [];
  const store: LocalStore = {
    getAll: <Row>(sql: string, parameters: unknown[] = []): Promise<Row[]> => {
      calls.push({ sql, parameters });
      const table = /FROM\s+(\w+)/.exec(sql)?.[1] ?? '';
      return Promise.resolve((rowsByTable[table] ?? []) as Row[]);
    },
  };
  return { store, calls };
}

function tripRow(id: string, checklistIds: string[]): LocalRow<'trips'> {
  return {
    id,
    rig_id: rigId,
    name: `trip ${id}`,
    start_location: null,
    start_place_id: null,
    checklist_ids: JSON.stringify(checklistIds),
    created_at: '2026-08-01 10:00:00.000Z',
  };
}

function stopRow(
  id: string,
  trip: string,
  position: number,
  arrived: number,
): LocalRow<'stops'> {
  return {
    id,
    trip_id: trip,
    rig_id: rigId,
    position,
    arrived,
    campground: `stop ${id}`,
    place_id: null,
    campsite: null,
    arrival_date: null,
    nights: null,
    check_in_time: null,
    check_out_time: null,
    booking_number: null,
    cost_cents: null,
    address: null,
    phone: null,
    notes: null,
    leg_km: null,
    leg_km_manual: null,
    created_at: '2026-08-01 10:00:00.000Z',
  };
}

function attachmentRow(id: string, stopId: string): LocalRow<'attachments'> {
  return {
    id,
    stop_id: stopId,
    rig_id: rigId,
    filename: `${id}.pdf`,
    mime_type: 'application/pdf',
    size_bytes: 1024,
    is_campground_map: 0,
    created_at: '2026-08-01 10:00:00.000Z',
  };
}

const stopA0 = '550e8400-e29b-41d4-a716-446655440070';
const stopA1 = '550e8400-e29b-41d4-a716-446655440071';
const stopB0 = '550e8400-e29b-41d4-a716-446655440072';

describe('stitchTrips', () => {
  it('nests each trip’s stops in the order given and each stop’s attachments under it', () => {
    const trips = stitchTrips(
      [tripRow(tripId, []), tripRow(otherTripId, [])],
      [
        stopRow(stopA0, tripId, 0, 0),
        stopRow(stopB0, otherTripId, 0, 0),
        stopRow(stopA1, tripId, 1, 0),
      ],
      [
        attachmentRow('550e8400-e29b-41d4-a716-446655440080', stopA1),
        attachmentRow('550e8400-e29b-41d4-a716-446655440081', stopA1),
      ],
      [],
    );

    expect(trips.map((trip) => trip.stops.map((stop) => stop.id))).toEqual([
      [stopA0, stopA1],
      [stopB0],
    ]);
    expect(trips[0]?.stops[1]?.attachments.map((a) => a.id)).toEqual([
      '550e8400-e29b-41d4-a716-446655440080',
      '550e8400-e29b-41d4-a716-446655440081',
    ]);
    expect(trips[0]?.stops[0]?.attachments).toEqual([]);
    for (const trip of trips) expect(TripReadSchema.parse(trip)).toEqual(trip);
  });

  it('derives status from the stops exactly as the API does', () => {
    const status = (stops: LocalRow<'stops'>[]): string =>
      stitchTrips([tripRow(tripId, [])], stops, [], [])[0]?.status ?? '';

    expect(status([])).toBe('planned');
    expect(status([stopRow(stopA0, tripId, 0, 0)])).toBe('planned');
    expect(
      status([stopRow(stopA0, tripId, 0, 1), stopRow(stopA1, tripId, 1, 0)]),
    ).toBe('underway');
    expect(
      status([stopRow(stopA0, tripId, 0, 1), stopRow(stopA1, tripId, 1, 1)]),
    ).toBe('completed');
  });

  it('drops checklist ids whose checklist no longer exists, as the read model does', () => {
    const trips = stitchTrips(
      [tripRow(tripId, [checklistId, deletedChecklistId])],
      [],
      [],
      [{ id: checklistId }],
    );

    expect(trips[0]?.checklistIds).toEqual([checklistId]);
  });
});

describe('tripsByRigQuery', () => {
  it('reads the three rig-scoped tables plus the live checklists, in position and upload order', async () => {
    const { store, calls } = fakeStore({
      trips: [tripRow(tripId, [])],
      stops: [stopRow(stopA0, tripId, 0, 1)],
      attachments: [],
      checklists: [],
    });

    const trips = await tripsByRigQuery(rigId).run(store);

    expect(trips?.[0]?.status).toBe('completed');
    expect(calls.map((call) => call.parameters)).toEqual([
      [rigId],
      [rigId],
      [rigId],
      [rigId],
    ]);
    expect(calls[1]?.sql).toContain('ORDER BY position');
    expect(calls[2]?.sql).toContain('ORDER BY created_at');
    expect(tripsByRigQuery(rigId).tables).toEqual([
      'trips',
      'stops',
      'attachments',
      'checklists',
    ]);
  });
});

describe('tasksQuery', () => {
  it('scopes to the rig and orders by name, as the task repository does', async () => {
    const { store, calls } = fakeStore({ maintenance_tasks: [] });

    await tasksQuery(rigId).run(store);

    expect(calls[0]?.sql).toContain('WHERE rig_id = ?');
    expect(calls[0]?.sql).toContain('ORDER BY name');
    expect(calls[0]?.parameters).toEqual([rigId]);
  });
});

describe('runQuery', () => {
  it('reports no answer when the row is absent, so the cache entry is left alone', async () => {
    const { store } = fakeStore({ runs: [] });

    await expect(
      runQuery('550e8400-e29b-41d4-a716-446655440030').run(store),
    ).resolves.toBeUndefined();
  });
});

/* eslint-disable unicorn/no-null -- rows and op-data exactly as SQLite/PowerSync hand them back. */
import type { CrudEntry } from '@powersync/web';
import type { LocalRow } from './tables.js';
import { planUpload } from './upload-plan.js';

const id = '550e8400-e29b-41d4-a716-446655440010';
const rigId = '550e8400-e29b-41d4-a716-446655440001';

/** A `CrudEntry`-shaped fake — only the data fields `upload-plan.ts` reads matter. */
function entry(
  overrides: Omit<Partial<CrudEntry>, 'op'> & {
    table: string;
    op: 'PUT' | 'PATCH' | 'DELETE';
  },
): CrudEntry {
  return {
    clientId: 1,
    id,
    opData: undefined,
    previousValues: undefined,
    transactionId: 1,
    metadata: undefined,
    toJSON: () => ({}),
    equals: () => false,
    toComparisonArray: () => [],
    ...overrides,
  } as unknown as CrudEntry;
}

describe('planUpload', () => {
  it('never writes the network-only users table', () => {
    expect(
      planUpload(
        entry({ table: 'users', op: 'PATCH', opData: { name: 'A' } }),
        { id, email: 'a@example.com', name: null, picture: null },
        {},
      ),
    ).toBeUndefined();
  });

  it('creates a rig with its client-generated id', () => {
    const row: LocalRow<'rigs'> = {
      id: rigId,
      owner_id: 'owner-1',
      vin: null,
      make: null,
      model: null,
      year: null,
      nickname: 'Silver Bullet',
      distance_km: null,
      travel_height_mm: null,
      length_mm: null,
      combined_length_mm: null,
      clearance_passenger_mm: null,
      clearance_driver_mm: null,
      created_at: '2026-08-01T00:00:00.000Z',
    };

    const request = planUpload(
      entry({ table: 'rigs', op: 'PUT', id: rigId }),
      row,
      { editedAt: '2026-08-20T00:00:00.000Z' },
    );

    expect(request).toEqual({
      method: 'POST',
      path: '/rigs',
      body: { id: rigId, nickname: 'Silver Bullet' },
      fatalStatuses: [404, 409],
      editedAt: '2026-08-20T00:00:00.000Z',
    });
  });

  it('edits a rig as a full record, so an untouched field is a no-op and an unset one clears', () => {
    const row: LocalRow<'rigs'> = {
      id: rigId,
      owner_id: 'owner-1',
      vin: null,
      make: 'Airstream',
      model: null,
      year: null,
      nickname: 'Silver Bullet',
      distance_km: 12_000,
      travel_height_mm: null,
      length_mm: null,
      combined_length_mm: null,
      clearance_passenger_mm: null,
      clearance_driver_mm: null,
      created_at: '2026-08-01T00:00:00.000Z',
    };

    const request = planUpload(
      entry({
        table: 'rigs',
        op: 'PATCH',
        id: rigId,
        opData: { distance_km: 12_000 },
      }),
      row,
      {},
    );

    expect(request?.method).toBe('PATCH');
    expect(request?.path).toBe(`/rigs/${rigId}`);
    expect(request?.body).toMatchObject({
      nickname: 'Silver Bullet',
      make: 'Airstream',
      vin: null,
      model: null,
      distanceKm: 12_000,
    });
  });

  it('deletes a rig', () => {
    expect(
      planUpload(
        entry({ table: 'rigs', op: 'DELETE', id: rigId }),
        undefined,
        {},
      ),
    ).toEqual({
      method: 'DELETE',
      path: `/rigs/${rigId}`,
      fatalStatuses: [404],
    });
  });

  it('replays a stop arrival as the explicit operation, never a generic PATCH', () => {
    const row: LocalRow<'stops'> = {
      id,
      trip_id: 'trip-1',
      rig_id: rigId,
      position: 0,
      arrived: 1,
      campground: null,
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
      created_at: '2026-08-01T00:00:00.000Z',
    };

    const request = planUpload(
      entry({ table: 'stops', op: 'PATCH', opData: { arrived: 1 } }),
      row,
      {},
    );

    expect(request).toEqual({
      method: 'POST',
      path: `/stops/${id}/arrival`,
      body: { arrived: true },
      fatalStatuses: [404],
    });
  });

  it('replays a stop reorder as the explicit operation', () => {
    const request = planUpload(
      entry({ table: 'stops', op: 'PATCH', opData: { position: 2 } }),
      {},
      {},
    );

    expect(request).toEqual({
      method: 'POST',
      path: `/stops/${id}/reorder`,
      body: { position: 2 },
      fatalStatuses: [404],
    });
  });

  it('replays any other stop write as the detail PATCH', () => {
    const row: LocalRow<'stops'> = {
      id,
      trip_id: 'trip-1',
      rig_id: rigId,
      position: 0,
      arrived: 0,
      campground: 'Pine Ridge',
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
      created_at: '2026-08-01T00:00:00.000Z',
    };

    const request = planUpload(
      entry({
        table: 'stops',
        op: 'PATCH',
        opData: { campground: 'Pine Ridge' },
      }),
      row,
      {},
    );

    expect(request?.method).toBe('PATCH');
    expect(request?.path).toBe(`/stops/${id}`);
    expect(request?.body).toMatchObject({ campground: 'Pine Ridge' });
    expect(
      (request?.body as Record<string, unknown>)['arrived'],
    ).toBeUndefined();
    expect(
      (request?.body as Record<string, unknown>)['position'],
    ).toBeUndefined();
  });

  it('replays a run patch carrying step ops as the step-ops endpoint', () => {
    const ops = [{ stepId: 'step-1', state: 'complete' as const }];

    const request = planUpload(
      entry({ table: 'runs', op: 'PATCH', opData: { steps: '[]' } }),
      {},
      { runStepOps: ops },
    );

    expect(request).toEqual({
      method: 'POST',
      path: `/runs/${id}/step-ops`,
      body: { ops },
      fatalStatuses: [404],
    });
  });

  it('falls back to a whole-record run PATCH with no step ops in the metadata', () => {
    const row: LocalRow<'runs'> = {
      id,
      checklist_id: 'checklist-1',
      rig_id: rigId,
      trip_id: null,
      started_on: '2026-08-20',
      steps: '[]',
      created_at: '2026-08-01T00:00:00.000Z',
    };

    const request = planUpload(
      entry({
        table: 'runs',
        op: 'PATCH',
        opData: { started_on: '2026-08-20' },
      }),
      row,
      {},
    );

    expect(request?.method).toBe('PATCH');
    expect(request?.path).toBe(`/runs/${id}`);
    expect(request?.body).toEqual({ startedOn: '2026-08-20', steps: [] });
  });

  it('replays the campground-map toggle as its own POST', () => {
    const request = planUpload(
      entry({
        table: 'attachments',
        op: 'PATCH',
        opData: { is_campground_map: 1 },
      }),
      { id, stop_id: 'stop-1' },
      {},
    );

    expect(request).toEqual({
      method: 'POST',
      path: `/attachments/${id}/campground-map`,
      body: { isCampgroundMap: true },
      fatalStatuses: [404],
    });
  });

  it('never creates an attachment — offline capture is the IndexedDB outbox, not this queue', () => {
    expect(
      planUpload(entry({ table: 'attachments', op: 'PUT' }), {}, {}),
    ).toBeUndefined();
  });

  it('deletes an attachment with 404 among the fatal statuses (already gone is success)', () => {
    const request = planUpload(
      entry({ table: 'attachments', op: 'DELETE' }),
      undefined,
      {},
    );

    expect(request?.fatalStatuses).toContain(404);
  });

  it('reassembles a maintenance task’s interval from the full local row on every edit', () => {
    const row: LocalRow<'maintenance_tasks'> = {
      id,
      rig_id: rigId,
      name: 'Check tires',
      description: null,
      interval_months: 6,
      interval_km: null,
      one_time: 0,
      last_performed: null,
      field_schema: '[]',
      tags: null,
      created_at: '2026-08-01T00:00:00.000Z',
    };

    const request = planUpload(
      entry({
        table: 'maintenance_tasks',
        op: 'PATCH',
        opData: { interval_months: 6 },
      }),
      row,
      {},
    );

    expect(request?.body).toMatchObject({
      interval: { months: 6 },
      oneTime: null,
      tags: [],
    });
  });

  it('stamps X-Edited-At on every request kind when the metadata carries one', () => {
    const request = planUpload(
      entry({ table: 'rigs', op: 'DELETE', id: rigId }),
      undefined,
      {
        editedAt: '2026-08-20T00:00:00.000Z',
      },
    );

    expect(request?.editedAt).toBe('2026-08-20T00:00:00.000Z');
  });

  it('leaves a PATCH with no local row unresolved rather than sending a bad request', () => {
    expect(
      planUpload(
        entry({ table: 'rigs', op: 'PATCH', opData: { nickname: 'x' } }),
        undefined,
        {},
      ),
    ).toBeUndefined();
  });
});

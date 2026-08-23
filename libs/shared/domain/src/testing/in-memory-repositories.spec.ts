import type { Checklist } from '../lib/checklist.js';
import type { Rig } from '../lib/rig.js';
import { createInMemoryRepositories } from './in-memory-repositories.js';

const rig = (id: string, ownerId: string): Rig => ({
  id,
  ownerId,
  vin: `VIN-${id}`,
  make: 'Airstream',
  model: 'Flying Cloud',
  year: 2021,
  nickname: `Rig ${id}`,
});

const checklist = (id: string, rigId: string): Checklist => ({
  id,
  rigId,
  name: `List ${id}`,
  tags: [],
  steps: [],
});

const run = (id: string, tripId?: string) => ({
  id,
  checklistId: 'x',
  rigId: 'rig-1',
  startedOn: '2026-08-19',
  steps: [],
  ...(tripId && { tripId }),
});

const attachment = (id: string, stopId: string) => ({
  id,
  stopId,
  rigId: 'rig-1',
  filename: `${id}.pdf`,
  mimeType: 'application/pdf' as const,
  sizeBytes: 1000,
  isCampgroundMap: false,
});

const later = (): Date => new Date(Date.now() + 60_000);
const earlier = (): Date => new Date(Date.now() - 60_000);

describe('in-memory repositories', () => {
  it('saves and finds an aggregate by id', async () => {
    const { rigs } = createInMemoryRepositories();
    await rigs.save(rig('a', 'owner-1'));
    expect(await rigs.findById('a')).toEqual(rig('a', 'owner-1'));
  });

  it('returns undefined for an unknown id', async () => {
    const { rigs } = createInMemoryRepositories();
    expect(await rigs.findById('missing')).toBeUndefined();
  });

  it('does not alias stored aggregates — a later mutation of the input never leaks', async () => {
    const { rigs } = createInMemoryRepositories();
    const input = rig('a', 'owner-1');
    await rigs.save(input);
    input.nickname = 'mutated after save';
    const found = await rigs.findById('a');
    expect(found?.nickname).toBe('Rig a');
  });

  it('save upserts (replaces) an existing aggregate', async () => {
    const { rigs } = createInMemoryRepositories();
    await rigs.save(rig('a', 'owner-1'));
    await rigs.save({ ...rig('a', 'owner-1'), nickname: 'Renamed' });
    const found = await rigs.findById('a');
    expect(found?.nickname).toBe('Renamed');
  });

  it('deletes an aggregate', async () => {
    const { rigs } = createInMemoryRepositories();
    await rigs.save(rig('a', 'owner-1'));
    await rigs.delete('a');
    expect(await rigs.findById('a')).toBeUndefined();
  });

  it('scopes rigs to their owner', async () => {
    const { rigs } = createInMemoryRepositories();
    await rigs.save(rig('a', 'owner-1'));
    await rigs.save(rig('b', 'owner-2'));
    await rigs.save(rig('c', 'owner-1'));
    const mine = await rigs.listByOwner('owner-1');
    // The double preserves Map insertion order, so 'a' and 'c' come back in that order.
    expect(mine.map((r) => r.id)).toEqual(['a', 'c']);
  });

  it('scopes child aggregates to their rig', async () => {
    const { checklists } = createInMemoryRepositories();
    await checklists.save(checklist('x', 'rig-1'));
    await checklists.save(checklist('y', 'rig-2'));
    const forRig = await checklists.listByRig('rig-1');
    expect(forRig.map((c) => c.id)).toEqual(['x']);
  });

  it('scopes trips to their rig', async () => {
    const { trips } = createInMemoryRepositories();
    await trips.save({
      id: 't1',
      rigId: 'rig-1',
      name: 'One',
      checklistIds: [],
    });
    await trips.save({
      id: 't2',
      rigId: 'rig-2',
      name: 'Two',
      checklistIds: [],
    });
    const forRig = await trips.listByRig('rig-1');
    expect(forRig.map((t) => t.id)).toEqual(['t1']);
  });

  it('lands a create-with-stops where the stop repository reads (issue #120)', async () => {
    const { trips, stops } = createInMemoryRepositories();
    await trips.createWithStops(
      { id: 't1', rigId: 'rig-1', name: 'Loop', checklistIds: [] },
      [
        { id: 's1', tripId: 't1', rigId: 'rig-1', position: 0, arrived: false },
        { id: 's2', tripId: 't1', rigId: 'rig-1', position: 1, arrived: false },
      ],
    );
    const savedTrip = await trips.findById('t1');
    expect(savedTrip?.name).toBe('Loop');
    const forTrip = await stops.listByTrip('t1');
    expect(forTrip.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('lists a trip’s stops ordered by position, not insertion order', async () => {
    const { stops } = createInMemoryRepositories();
    await stops.save({
      id: 's2',
      tripId: 't1',
      rigId: 'rig-1',
      position: 1,
      arrived: false,
    });
    await stops.save({
      id: 's1',
      tripId: 't1',
      rigId: 'rig-1',
      position: 0,
      arrived: false,
    });
    await stops.save({
      id: 'sx',
      tripId: 't2',
      rigId: 'rig-1',
      position: 0,
      arrived: false,
    });
    const forTrip = await stops.listByTrip('t1');
    expect(forTrip.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('scopes runs to their trip', async () => {
    const { runs } = createInMemoryRepositories();
    await runs.save(run('r1', 't1'));
    await runs.save(run('r2'));
    await runs.save(run('r3', 't2'));
    const forTrip = await runs.listByTrip('t1');
    expect(forTrip.map((r) => r.id)).toEqual(['r1']);
  });

  it('scopes attachments to their stop', async () => {
    const { attachments } = createInMemoryRepositories();
    await attachments.save(attachment('a1', 's1'));
    await attachments.save(attachment('a2', 's2'));
    const forStop = await attachments.listByStop('s1');
    expect(forStop.map((a) => a.id)).toEqual(['a1']);
  });

  describe('saveIfNewer — per-record LWW (ADR-0028, issue #141)', () => {
    it('applies a write stamped newer than the stored edit time', async () => {
      const { rigs } = createInMemoryRepositories();
      await rigs.save(rig('a', 'owner-1'));
      const outcome = await rigs.saveIfNewer(
        { ...rig('a', 'owner-1'), nickname: 'Renamed' },
        later(),
      );
      expect(outcome.applied).toBe(true);
      expect(outcome.record.nickname).toBe('Renamed');
      const found = await rigs.findById('a');
      expect(found?.nickname).toBe('Renamed');
    });

    it('no-ops a write stamped older, returning the current record', async () => {
      const { rigs } = createInMemoryRepositories();
      await rigs.save(rig('a', 'owner-1'));
      const outcome = await rigs.saveIfNewer(
        { ...rig('a', 'owner-1'), nickname: 'Stale' },
        earlier(),
      );
      expect(outcome.applied).toBe(false);
      expect(outcome.record.nickname).toBe('Rig a');
      const found = await rigs.findById('a');
      expect(found?.nickname).toBe('Rig a');
    });

    it('no-ops a write stamped exactly at the stored edit time (strictly newer wins)', async () => {
      const { rigs } = createInMemoryRepositories();
      const stamp = later();
      await rigs.save(rig('a', 'owner-1'));
      await rigs.saveIfNewer(
        { ...rig('a', 'owner-1'), nickname: 'First' },
        stamp,
      );
      const outcome = await rigs.saveIfNewer(
        { ...rig('a', 'owner-1'), nickname: 'Echo' },
        new Date(stamp),
      );
      expect(outcome.applied).toBe(false);
      expect(outcome.record.nickname).toBe('First');
    });

    it('an applied stamp becomes the stored edit time the next write compares against', async () => {
      const { rigs } = createInMemoryRepositories();
      await rigs.save(rig('a', 'owner-1'));
      const first = later();
      await rigs.saveIfNewer(
        { ...rig('a', 'owner-1'), nickname: 'First' },
        first,
      );
      const between = new Date(first.getTime() - 1);
      const outcome = await rigs.saveIfNewer(
        { ...rig('a', 'owner-1'), nickname: 'Between' },
        between,
      );
      expect(outcome.applied).toBe(false);
      expect(outcome.record.nickname).toBe('First');
    });

    it('a plain save re-stamps the record to now, so an older stamp loses to it', async () => {
      const { rigs } = createInMemoryRepositories();
      await rigs.save(rig('a', 'owner-1'));
      await rigs.save({ ...rig('a', 'owner-1'), nickname: 'Online edit' });
      const outcome = await rigs.saveIfNewer(
        { ...rig('a', 'owner-1'), nickname: 'Stale replay' },
        earlier(),
      );
      expect(outcome.applied).toBe(false);
      expect(outcome.record.nickname).toBe('Online edit');
    });

    it('rejects a conditional write on a record that does not exist', async () => {
      const { rigs } = createInMemoryRepositories();
      await expect(
        rigs.saveIfNewer(rig('missing', 'owner-1'), later()),
      ).rejects.toThrow('missing');
    });
  });
});

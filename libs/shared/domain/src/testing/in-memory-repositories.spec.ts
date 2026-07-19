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
});

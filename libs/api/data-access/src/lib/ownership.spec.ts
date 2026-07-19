import { ownedBy, ownedOrUndefined, ownerWhere } from './ownership.js';

const alice = '550e8400-e29b-41d4-a716-446655440001';
const bob = '550e8400-e29b-41d4-a716-446655440002';

const rows = [
  { id: 'r1', ownerId: alice, label: 'alice-1' },
  { id: 'r2', ownerId: bob, label: 'bob-1' },
  { id: 'r3', ownerId: alice, label: 'alice-2' },
];

describe('ownedBy', () => {
  it('returns only the rows belonging to the owner', () => {
    expect(ownedBy(rows, alice)).toEqual([
      { id: 'r1', ownerId: alice, label: 'alice-1' },
      { id: 'r3', ownerId: alice, label: 'alice-2' },
    ]);
  });

  it('never returns another owner’s rows', () => {
    for (const row of ownedBy(rows, alice)) {
      expect(row.ownerId).toBe(alice);
    }
  });

  it('returns nothing for an owner with no rows', () => {
    expect(ownedBy(rows, '550e8400-e29b-41d4-a716-446655440099')).toEqual([]);
  });
});

describe('ownedOrUndefined', () => {
  it('resolves a row the owner owns', () => {
    expect(ownedOrUndefined(rows[0], alice)).toEqual(rows[0]);
  });

  it('hides another owner’s row as undefined (no existence leak)', () => {
    expect(ownedOrUndefined(rows[1], alice)).toBeUndefined();
  });

  it('passes through a missing row', () => {
    expect(ownedOrUndefined(undefined, alice)).toBeUndefined();
  });
});

describe('ownerWhere', () => {
  it('builds an owner-scoped filter fragment', () => {
    expect(ownerWhere(alice)).toEqual({ ownerId: alice });
  });
});

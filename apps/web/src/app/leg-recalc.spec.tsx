import {
  canAutoFillLeg,
  changedLegOrigins,
  previousPlaceIn,
} from './leg-recalc';

describe('canAutoFillLeg (the legKmManual tri-state rule, issue #121)', () => {
  it('never fills an arrived stop', () => {
    expect(
      canAutoFillLeg({ arrived: true, legKm: 100, legKmManual: false }),
    ).toBe(false);
  });

  it('never overwrites a manually typed leg', () => {
    expect(canAutoFillLeg({ legKm: 80, legKmManual: true })).toBe(false);
  });

  it('fills over a previously fetched leg', () => {
    expect(canAutoFillLeg({ legKm: 100, legKmManual: false })).toBe(true);
  });

  it('fills when there is no leg yet', () => {
    expect(canAutoFillLeg({ legKm: undefined, legKmManual: undefined })).toBe(
      true,
    );
  });

  it('treats a pre-existing leg of unknown provenance as manual', () => {
    expect(canAutoFillLeg({ legKm: 100, legKmManual: undefined })).toBe(false);
  });

  it('works for drafts, which never carry an arrived flag', () => {
    expect(canAutoFillLeg({ legKm: 100, legKmManual: false })).toBe(true);
    expect(
      canAutoFillLeg({ arrived: false, legKm: 100, legKmManual: false }),
    ).toBe(true);
  });
});

interface Item {
  readonly id: string;
  readonly placeId: string | undefined;
}

const a: Item = { id: 'a', placeId: 'place-a' };
const b: Item = { id: 'b', placeId: 'place-b' };
const c: Item = { id: 'c', placeId: undefined };

const keyOf = (item: Item): string => item.id;

describe('previousPlaceIn', () => {
  it('uses the start place for the first item', () => {
    expect(previousPlaceIn([a, b], 0, 'place-start')).toBe('place-start');
  });

  it('uses the previous item’s place otherwise', () => {
    expect(previousPlaceIn([a, b], 1, 'place-start')).toBe('place-a');
  });

  it('is undefined when the previous item has no place', () => {
    expect(previousPlaceIn([c, b], 1, 'place-start')).toBeUndefined();
  });
});

describe('changedLegOrigins', () => {
  it('reports nothing when the order and start are unchanged', () => {
    expect(changedLegOrigins([a, b], 'start', [a, b], 'start', keyOf)).toEqual(
      [],
    );
  });

  it('reports both affected items on a swap, with their new origins', () => {
    expect(changedLegOrigins([a, b], 'start', [b, a], 'start', keyOf)).toEqual([
      { item: b, from: 'start' },
      { item: a, from: 'place-b' },
    ]);
  });

  it('reports the item that moves up on a delete', () => {
    expect(changedLegOrigins([a, b], 'start', [b], 'start', keyOf)).toEqual([
      { item: b, from: 'start' },
    ]);
  });

  it('expresses a start-place change as the first item’s new origin', () => {
    expect(
      changedLegOrigins([a, b], undefined, [a, b], 'start', keyOf),
    ).toEqual([{ item: a, from: 'start' }]);
  });

  it('matches by key, never by object reference', () => {
    // The editor's `after` array comes from the reorder response — fresh
    // objects with the same ids. Reference equality would flag everything.
    const freshA: Item = { ...a };
    const freshB: Item = { ...b };
    expect(
      changedLegOrigins([a, b], 'start', [freshA, freshB], 'start', keyOf),
    ).toEqual([]);
  });

  it('reports an origin that becomes undefined', () => {
    expect(
      changedLegOrigins([a, b], 'start', [a, b], undefined, keyOf),
    ).toEqual([{ item: a, from: undefined }]);
  });
});

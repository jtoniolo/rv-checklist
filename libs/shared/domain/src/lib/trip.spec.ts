import {
  CreateStopSchema,
  CreateTripSchema,
  currentTrip,
  ReorderStopSchema,
  SetStopArrivedSchema,
  StopSchema,
  tripStatus,
  TripSchema,
  UpdateStopSchema,
  UpdateTripSchema,
} from './trip.js';

const tripId = '550e8400-e29b-41d4-a716-446655440000';
const rigId = '550e8400-e29b-41d4-a716-446655440001';
const stopId = '550e8400-e29b-41d4-a716-446655440002';
const checklistId = '550e8400-e29b-41d4-a716-446655440003';

const fullTrip = {
  id: tripId,
  rigId,
  name: 'Fall colours loop',
  startLocation: 'Home driveway, Ottawa',
  startPlaceId: 'ChIJHome123',
  checklistIds: [checklistId],
};

const fullStop = {
  id: stopId,
  tripId,
  position: 0,
  arrived: false,
  campground: 'Algonquin Lake of Two Rivers',
  placeId: 'ChIJStop456',
  campsite: 'B-42',
  arrivalDate: '2026-09-12',
  nights: 3,
  checkInTime: 'after 2pm',
  checkOutTime: '11:00',
  bookingNumber: 'ON-123456',
  costCents: 14_250,
  address: 'Hwy 60, Algonquin Park, ON',
  phone: '+1 705 555 0123',
  notes: 'gate code 4482, wifi at office',
  legKm: 245,
};

describe('TripSchema', () => {
  it('parses a fully-detailed trip', () => {
    expect(TripSchema.parse(fullTrip)).toEqual(fullTrip);
  });

  it('parses a minimal trip (no start point)', () => {
    const minimal = { id: tripId, rigId, name: 'Shakedown', checklistIds: [] };
    expect(TripSchema.parse(minimal)).toEqual(minimal);
  });

  it('rejects a blank name', () => {
    expect(TripSchema.safeParse({ ...fullTrip, name: '' }).success).toBe(false);
  });

  it('rejects a non-uuid checklist id', () => {
    expect(
      TripSchema.safeParse({ ...fullTrip, checklistIds: ['nope'] }).success,
    ).toBe(false);
  });
});

describe('StopSchema', () => {
  it('parses a fully-detailed stop', () => {
    expect(StopSchema.parse(fullStop)).toEqual(fullStop);
  });

  it('parses a bare stop (every detail field absent)', () => {
    const bare = { id: stopId, tripId, position: 2, arrived: true };
    expect(StopSchema.parse(bare)).toEqual(bare);
  });

  it('rejects a negative legKm', () => {
    expect(StopSchema.safeParse({ ...fullStop, legKm: -5 }).success).toBe(
      false,
    );
  });

  it('rejects a fractional legKm (whole kilometres only)', () => {
    expect(StopSchema.safeParse({ ...fullStop, legKm: 12.5 }).success).toBe(
      false,
    );
  });

  it('rejects zero nights (a stop is an overnight halt)', () => {
    expect(StopSchema.safeParse({ ...fullStop, nights: 0 }).success).toBe(
      false,
    );
  });

  it('rejects a negative costCents', () => {
    expect(StopSchema.safeParse({ ...fullStop, costCents: -1 }).success).toBe(
      false,
    );
  });

  it('rejects an invalid arrivalDate', () => {
    expect(
      StopSchema.safeParse({ ...fullStop, arrivalDate: 'someday' }).success,
    ).toBe(false);
  });

  it('rejects a negative position', () => {
    expect(StopSchema.safeParse({ ...fullStop, position: -1 }).success).toBe(
      false,
    );
  });
});

describe('CreateTripSchema', () => {
  it('accepts a name-only create body, defaulting checklistIds to []', () => {
    expect(CreateTripSchema.parse({ rigId, name: 'Shakedown' })).toEqual({
      rigId,
      name: 'Shakedown',
      checklistIds: [],
    });
  });

  it('accepts a create body with a start point and checklists', () => {
    const { id: _id, ...body } = fullTrip;
    expect(CreateTripSchema.parse(body)).toEqual(body);
  });
});

describe('UpdateTripSchema', () => {
  it('accepts an empty update (no fields changed)', () => {
    expect(UpdateTripSchema.parse({})).toEqual({});
  });

  it('accepts null to clear the start point', () => {
    // eslint-disable-next-line unicorn/no-null
    const update = { startLocation: null, startPlaceId: null };
    expect(UpdateTripSchema.parse(update)).toEqual(update);
  });

  it('accepts a whole-set checklistIds replacement', () => {
    const update = { checklistIds: [checklistId] };
    expect(UpdateTripSchema.parse(update)).toEqual(update);
  });

  it('rejects a blank name', () => {
    expect(UpdateTripSchema.safeParse({ name: '' }).success).toBe(false);
  });
});

describe('CreateStopSchema', () => {
  it('accepts a trip-only create body (position and arrived are server-owned)', () => {
    expect(CreateStopSchema.parse({ tripId })).toEqual({ tripId });
  });

  it('accepts a create body with every detail field', () => {
    const { id: _id, position: _p, arrived: _a, ...body } = fullStop;
    expect(CreateStopSchema.parse(body)).toEqual(body);
  });

  it('strips a client-sent position and arrived', () => {
    const parsed = CreateStopSchema.parse({
      tripId,
      position: 9,
      arrived: true,
    });
    expect(parsed).toEqual({ tripId });
  });
});

describe('UpdateStopSchema', () => {
  it('accepts an empty update (no fields changed)', () => {
    expect(UpdateStopSchema.parse({})).toEqual({});
  });

  it('accepts null to clear a field', () => {
    // eslint-disable-next-line unicorn/no-null
    const update = { legKm: null, campsite: null, costCents: null };
    expect(UpdateStopSchema.parse(update)).toEqual(update);
  });

  it('accepts values to set fields', () => {
    const update = { campground: 'KOA Kingston', legKm: 165 };
    expect(UpdateStopSchema.parse(update)).toEqual(update);
  });

  it('never edits arrived or position (dedicated operations own them)', () => {
    expect(UpdateStopSchema.parse({ arrived: true, position: 3 })).toEqual({});
  });
});

describe('SetStopArrivedSchema', () => {
  it('requires the arrived flag', () => {
    expect(SetStopArrivedSchema.parse({ arrived: true })).toEqual({
      arrived: true,
    });
    expect(SetStopArrivedSchema.safeParse({}).success).toBe(false);
  });
});

describe('ReorderStopSchema', () => {
  it('requires a non-negative integer position', () => {
    expect(ReorderStopSchema.parse({ position: 2 })).toEqual({ position: 2 });
    expect(ReorderStopSchema.safeParse({ position: -1 }).success).toBe(false);
    expect(ReorderStopSchema.safeParse({ position: 1.5 }).success).toBe(false);
  });
});

// Derivation-test helpers — the barest stop shapes the two functions read.
const arrivedFlag = (hasArrived: boolean) => ({ arrived: hasArrived });

const orderedStop = (
  position: number,
  hasArrived: boolean,
  arrivalDate?: string,
) => ({
  position,
  arrived: hasArrived,
  ...(arrivalDate && { arrivalDate }),
});

const namedTrip = (name: string, stops: ReturnType<typeof orderedStop>[]) => ({
  name,
  stops,
});

describe('tripStatus', () => {
  it('is planned with zero stops', () => {
    expect(tripStatus([])).toBe('planned');
  });

  it('is planned while no stop is arrived', () => {
    expect(tripStatus([arrivedFlag(false), arrivedFlag(false)])).toBe(
      'planned',
    );
  });

  it('is underway once some stop is arrived', () => {
    expect(tripStatus([arrivedFlag(true), arrivedFlag(false)])).toBe(
      'underway',
    );
  });

  it('is completed when every stop is arrived (at least one stop)', () => {
    expect(tripStatus([arrivedFlag(true), arrivedFlag(true)])).toBe(
      'completed',
    );
  });
});

describe('currentTrip', () => {
  it('is undefined with no trips', () => {
    const noTrips: ReturnType<typeof namedTrip>[] = [];
    expect(currentTrip(noTrips)).toBeUndefined();
  });

  it('is undefined when every trip is completed', () => {
    const done = namedTrip('done', [orderedStop(0, true)]);
    expect(currentTrip([done])).toBeUndefined();
  });

  it('prefers the underway trip over any planned trip', () => {
    const underway = namedTrip('underway', [
      orderedStop(0, true),
      orderedStop(1, false),
    ]);
    const planned = namedTrip('planned', [orderedStop(0, false, '2026-01-01')]);
    expect(currentTrip([planned, underway])).toBe(underway);
  });

  it('falls back to the planned trip with the earliest first-stop arrival date', () => {
    const later = namedTrip('later', [orderedStop(0, false, '2026-10-01')]);
    const sooner = namedTrip('sooner', [orderedStop(0, false, '2026-09-01')]);
    expect(currentTrip([later, sooner])).toBe(sooner);
  });

  it('reads the first-stop date off the lowest position, not array order', () => {
    const a = namedTrip('a', [
      orderedStop(1, false, '2026-01-01'),
      orderedStop(0, false, '2026-12-01'),
    ]);
    const b = namedTrip('b', [orderedStop(0, false, '2026-06-01')]);
    expect(currentTrip([a, b])).toBe(b);
  });

  it('sorts a planned trip with an undated first stop after dated ones', () => {
    const undated = namedTrip('undated', [orderedStop(0, false)]);
    const dated = namedTrip('dated', [orderedStop(0, false, '2026-09-01')]);
    expect(currentTrip([undated, dated])).toBe(dated);
  });

  it('still surfaces an undated planned trip when it is the only one', () => {
    const undated = namedTrip('undated', [orderedStop(0, false)]);
    expect(currentTrip([undated])).toBe(undated);
  });
});

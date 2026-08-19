import {
  legKmFromMeters,
  PlaceDetailsSchema,
  RouteDistanceSchema,
} from './maps.js';

describe('legKmFromMeters (ADR-0025 rounding)', () => {
  it('rounds to the nearest 5 km', () => {
    expect(legKmFromMeters(123_456)).toBe(125);
    expect(legKmFromMeters(12_000)).toBe(10);
    expect(legKmFromMeters(13_000)).toBe(15);
  });

  it('rounds a half-step up', () => {
    expect(legKmFromMeters(2500)).toBe(5);
  });

  it('rounds a short hop down to zero', () => {
    expect(legKmFromMeters(2499)).toBe(0);
    expect(legKmFromMeters(0)).toBe(0);
  });

  it('always produces a valid RouteDistance payload', () => {
    for (const meters of [0, 1, 4999, 5000, 987_654, 2_500_000]) {
      expect(
        RouteDistanceSchema.safeParse({ legKm: legKmFromMeters(meters) })
          .success,
      ).toBe(true);
    }
  });
});

describe('RouteDistanceSchema', () => {
  it('rejects a leg that is not a multiple of 5 km', () => {
    expect(RouteDistanceSchema.safeParse({ legKm: 123 }).success).toBe(false);
  });
});

describe('PlaceDetailsSchema', () => {
  it('accepts a place with no address or phone', () => {
    expect(PlaceDetailsSchema.safeParse({}).success).toBe(true);
  });

  it('accepts address and phone together', () => {
    expect(
      PlaceDetailsSchema.safeParse({
        address: '123 Main St, Orillia, ON',
        phone: '(705) 555-0123',
      }).success,
    ).toBe(true);
  });
});

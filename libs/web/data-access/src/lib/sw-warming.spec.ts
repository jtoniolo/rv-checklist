import {
  TripReadSchema,
  tripStatus,
  type TripRead,
} from '@rv-checklist/domain';
import { buildTripWarmMessage, warmingActions } from './sw-warming.js';

const RIG_ID = '550e8400-e29b-41d4-a716-446655440010';
const TRIP_ID = '550e8400-e29b-41d4-a716-446655440100';
const OTHER_TRIP_ID = '550e8400-e29b-41d4-a716-446655440200';
const STOP_ID = '550e8400-e29b-41d4-a716-446655440101';

function uuid(n: number): string {
  return `550e8400-e29b-41d4-a716-${String(n).padStart(12, '0')}`;
}

function makeTrip(
  tripId: string,
  attachments: readonly {
    readonly id: number;
    readonly isCampgroundMap: boolean;
  }[] = [],
): TripRead {
  const stops = [
    {
      id: STOP_ID,
      tripId,
      position: 0,
      arrived: false,
      campground: 'Killbear PP',
      attachments: attachments.map((a) => ({
        id: uuid(a.id),
        stopId: STOP_ID,
        filename: `attachment-${String(a.id)}.png`,
        mimeType: 'image/png' as const,
        sizeBytes: 1024,
        isCampgroundMap: a.isCampgroundMap,
      })),
    },
  ];
  return TripReadSchema.parse({
    id: tripId,
    rigId: RIG_ID,
    name: 'Fall Colours Loop',
    checklistIds: [],
    stops,
    status: tripStatus(stops),
  });
}

describe('buildTripWarmMessage', () => {
  it('warms the dashboard and trip detail routes', () => {
    const trip = makeTrip(TRIP_ID);
    const message = buildTripWarmMessage(RIG_ID, trip);
    expect(message.routeUrls).toEqual([
      `/rig/${RIG_ID}`,
      `/rig/${RIG_ID}/trips/${TRIP_ID}`,
    ]);
  });

  it('orders attachment urls campground maps first', () => {
    const trip = makeTrip(TRIP_ID, [
      { id: 1, isCampgroundMap: false },
      { id: 2, isCampgroundMap: true },
    ]);
    const message = buildTripWarmMessage(RIG_ID, trip);
    expect(message.attachmentUrls.map((u) => u.split('/').pop())).toEqual([
      uuid(2),
      uuid(1),
    ]);
  });
});

describe('warmingActions', () => {
  it('warms the current trip on first render (trigger a/c)', () => {
    const trip = makeTrip(TRIP_ID);
    const actions = warmingActions(RIG_ID, undefined, trip);
    expect(actions.drop).toBeUndefined();
    expect(actions.cache?.tripId).toBe(TRIP_ID);
  });

  it('drops the previous trip and warms the new one when current changes', () => {
    const trip = makeTrip(OTHER_TRIP_ID);
    const actions = warmingActions(RIG_ID, TRIP_ID, trip);
    expect(actions.drop).toEqual({
      type: 'rv-checklist/drop-trip',
      tripId: TRIP_ID,
    });
    expect(actions.cache?.tripId).toBe(OTHER_TRIP_ID);
  });

  it('only drops when the trip stops being current (no replacement)', () => {
    const actions = warmingActions(RIG_ID, TRIP_ID, undefined);
    expect(actions.drop).toEqual({
      type: 'rv-checklist/drop-trip',
      tripId: TRIP_ID,
    });
    expect(actions.cache).toBeUndefined();
  });

  it('re-warms the same trip when its attachments change (trigger b)', () => {
    const before = makeTrip(TRIP_ID, [{ id: 1, isCampgroundMap: false }]);
    const after = makeTrip(TRIP_ID, [
      { id: 1, isCampgroundMap: false },
      { id: 2, isCampgroundMap: false },
    ]);
    const actions = warmingActions(RIG_ID, TRIP_ID, after, before);
    expect(actions.drop).toBeUndefined();
    expect(actions.cache?.attachmentUrls).toHaveLength(2);
  });

  it('does nothing when neither the current trip nor its attachments changed', () => {
    const trip = makeTrip(TRIP_ID, [{ id: 1, isCampgroundMap: false }]);
    const actions = warmingActions(RIG_ID, TRIP_ID, trip, trip);
    expect(actions.drop).toBeUndefined();
    expect(actions.cache).toBeUndefined();
  });

  it('does nothing when there is no current trip and never was one', () => {
    const actions = warmingActions(RIG_ID, undefined, undefined);
    expect(actions.drop).toBeUndefined();
    expect(actions.cache).toBeUndefined();
  });
});

import { tripCacheName, type SwMessage } from '@rv-checklist/domain';
import { handleSwMessage } from './message-handler.js';
import { FakeCacheStorage } from './test-fakes/fake-cache-storage.js';

const TRIP_ID = 'trip-1';
const MAP_URL = 'https://api.example.com/attachments/map';

function okResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

describe('handleSwMessage', () => {
  it('warms a trip on a cache-trip message', async () => {
    const caches = new FakeCacheStorage();
    const fetcher = jest.fn().mockResolvedValue(okResponse('bytes'));
    const message: SwMessage = {
      type: 'rv-checklist/cache-trip',
      tripId: TRIP_ID,
      routeUrls: ['/rig/r1'],
      attachmentUrls: [MAP_URL],
    };

    await handleSwMessage(caches, message, fetcher);

    const cache = await caches.open(tripCacheName(TRIP_ID));
    expect(await cache.match(MAP_URL)).toBeDefined();
  });

  it('drops a trip cache on a drop-trip message', async () => {
    const caches = new FakeCacheStorage();
    const cache = await caches.open(tripCacheName(TRIP_ID));
    await cache.put(MAP_URL, okResponse('bytes'));
    const message: SwMessage = {
      type: 'rv-checklist/drop-trip',
      tripId: TRIP_ID,
    };

    await handleSwMessage(caches, message, jest.fn());

    expect(await caches.has(tripCacheName(TRIP_ID))).toBe(false);
  });

  it('evicts an attachment on an evict-attachment message', async () => {
    const caches = new FakeCacheStorage();
    const cache = await caches.open(tripCacheName(TRIP_ID));
    await cache.put(MAP_URL, okResponse('bytes'));
    const message: SwMessage = {
      type: 'rv-checklist/evict-attachment',
      attachmentUrl: MAP_URL,
    };

    await handleSwMessage(caches, message, jest.fn());

    expect(await cache.match(MAP_URL)).toBeUndefined();
  });

  it('ignores a message of unknown shape rather than throwing', async () => {
    const caches = new FakeCacheStorage();
    await expect(
      handleSwMessage(caches, { type: 'not-a-real-message' }, jest.fn()),
    ).resolves.toBeUndefined();
  });

  it('ignores a non-object payload', async () => {
    const caches = new FakeCacheStorage();
    await expect(
      handleSwMessage(caches, 'just a string', jest.fn()),
    ).resolves.toBeUndefined();
  });
});

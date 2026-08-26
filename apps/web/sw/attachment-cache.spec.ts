import {
  ATTACHMENT_LRU_CACHE_NAME,
  ATTACHMENT_LRU_MAX_ENTRIES,
  tripCacheName,
} from '@rv-checklist/domain';
import {
  cacheTrip,
  dropTrip,
  evictAttachment,
  respondToAttachment,
} from './attachment-cache.js';
import { FakeCacheStorage } from './test-fakes/fake-cache-storage.js';

const TRIP_ID = 'trip-1';
const MAP_URL = 'https://api.example.com/attachments/map';
const OTHER_URL = 'https://api.example.com/attachments/other';

function okResponse(body: string): Response {
  return new Response(body, { status: 200 });
}

describe('cacheTrip', () => {
  it('fetches and caches every attachment url into the trip cache', async () => {
    const caches = new FakeCacheStorage();
    const fetcher = jest.fn().mockImplementation(() => okResponse('bytes'));

    await cacheTrip(
      caches,
      TRIP_ID,
      { routeUrls: [], attachmentUrls: [MAP_URL, OTHER_URL] },
      fetcher,
    );

    const cache = await caches.open(tripCacheName(TRIP_ID));
    expect(await cache.match(MAP_URL)).toBeDefined();
    expect(await cache.match(OTHER_URL)).toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('also warms the given route urls into the pages cache', async () => {
    const caches = new FakeCacheStorage();
    const fetcher = jest.fn().mockImplementation(() => okResponse('<html/>'));

    await cacheTrip(
      caches,
      TRIP_ID,
      { routeUrls: ['/rig/r1'], attachmentUrls: [] },
      fetcher,
    );

    const pages = await caches.open('rv-checklist-pages');
    expect(await pages.match('/rig/r1')).toBeDefined();
  });

  it('skips an attachment url already in the trip cache (SW skips cached ids)', async () => {
    const caches = new FakeCacheStorage();
    const cache = await caches.open(tripCacheName(TRIP_ID));
    await cache.put(MAP_URL, okResponse('already here'));
    const fetcher = jest.fn().mockImplementation(() => okResponse('bytes'));

    await cacheTrip(
      caches,
      TRIP_ID,
      { routeUrls: [], attachmentUrls: [MAP_URL] },
      fetcher,
    );

    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not let one failed fetch stop the rest of the warm', async () => {
    const caches = new FakeCacheStorage();
    const fetcher = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline mid-warm'))
      .mockImplementation(() => okResponse('bytes'));

    await cacheTrip(
      caches,
      TRIP_ID,
      { routeUrls: [], attachmentUrls: [MAP_URL, OTHER_URL] },
      fetcher,
    );

    const cache = await caches.open(tripCacheName(TRIP_ID));
    expect(await cache.match(MAP_URL)).toBeUndefined();
    expect(await cache.match(OTHER_URL)).toBeDefined();
  });
});

describe('dropTrip', () => {
  it('deletes the whole trip cache', async () => {
    const caches = new FakeCacheStorage();
    const cache = await caches.open(tripCacheName(TRIP_ID));
    await cache.put(MAP_URL, okResponse('bytes'));

    await dropTrip(caches, TRIP_ID);

    expect(await caches.has(tripCacheName(TRIP_ID))).toBe(false);
  });
});

describe('evictAttachment', () => {
  it('removes the entry from every cache it might be in', async () => {
    const caches = new FakeCacheStorage();
    const tripCache = await caches.open(tripCacheName(TRIP_ID));
    await tripCache.put(MAP_URL, okResponse('bytes'));
    const lru = await caches.open(ATTACHMENT_LRU_CACHE_NAME);
    await lru.put(MAP_URL, okResponse('bytes'));

    await evictAttachment(caches, MAP_URL);

    expect(await tripCache.match(MAP_URL)).toBeUndefined();
    expect(await lru.match(MAP_URL)).toBeUndefined();
  });

  it('is a no-op when the url is not cached anywhere', async () => {
    const caches = new FakeCacheStorage();
    await expect(evictAttachment(caches, MAP_URL)).resolves.toBeUndefined();
  });
});

describe('respondToAttachment', () => {
  it('serves a trip-cached attachment without touching the network', async () => {
    const caches = new FakeCacheStorage();
    const tripCache = await caches.open(tripCacheName(TRIP_ID));
    await tripCache.put(MAP_URL, okResponse('cached bytes'));
    const fetcher = jest.fn();

    const response = await respondToAttachment(caches, MAP_URL, fetcher);

    expect(await response.text()).toBe('cached bytes');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('serves an LRU-cached attachment without touching the network', async () => {
    const caches = new FakeCacheStorage();
    const lru = await caches.open(ATTACHMENT_LRU_CACHE_NAME);
    await lru.put(OTHER_URL, okResponse('lru bytes'));
    const fetcher = jest.fn();

    const response = await respondToAttachment(caches, OTHER_URL, fetcher);

    expect(await response.text()).toBe('lru bytes');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('falls back to the network and stores the result in the LRU cache', async () => {
    const caches = new FakeCacheStorage();
    const fetcher = jest.fn().mockResolvedValue(okResponse('fresh bytes'));

    const response = await respondToAttachment(caches, OTHER_URL, fetcher);

    expect(await response.text()).toBe('fresh bytes');
    const lru = await caches.open(ATTACHMENT_LRU_CACHE_NAME);
    expect(await lru.match(OTHER_URL)).toBeDefined();
  });

  it('evicts the oldest LRU entry once the cache grows past its cap', async () => {
    const caches = new FakeCacheStorage();
    const lru = await caches.open(ATTACHMENT_LRU_CACHE_NAME);
    for (let i = 0; i < ATTACHMENT_LRU_MAX_ENTRIES; i++) {
      await lru.put(
        `https://api.example.com/attachments/${String(i)}`,
        okResponse('x'),
      );
    }
    const fetcher = jest.fn().mockResolvedValue(okResponse('new'));

    await respondToAttachment(caches, OTHER_URL, fetcher);

    const keys = await lru.keys();
    expect(keys).toHaveLength(ATTACHMENT_LRU_MAX_ENTRIES);
    expect(
      await lru.match('https://api.example.com/attachments/0'),
    ).toBeUndefined();
    expect(await lru.match(OTHER_URL)).toBeDefined();
  });

  it('does not store into the LRU cache when the attachment already lives in a trip cache', async () => {
    // Regression: a trip-cache hit above never reaches here, but a warm that
    // races a browse must not duplicate the bytes into the LRU cache too.
    const caches = new FakeCacheStorage();
    const tripCache = await caches.open(tripCacheName(TRIP_ID));
    await tripCache.put(MAP_URL, okResponse('cached bytes'));
    const fetcher = jest.fn();

    await respondToAttachment(caches, MAP_URL, fetcher);

    const lru = await caches.open(ATTACHMENT_LRU_CACHE_NAME);
    expect(await lru.match(MAP_URL)).toBeUndefined();
  });
});

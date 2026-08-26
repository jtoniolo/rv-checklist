/*
 * Current-trip warming, the cache mechanics (ADR-0028, issue #151).
 *
 * Every function here takes its `CacheStorage` (and, where it fetches, its
 * fetch function) as a parameter rather than reading `self.caches` /
 * `self.fetch` directly — the same seam the rest of the repo uses to keep
 * browser-only code testable under Jest (compare `local-store.ts`'s injected
 * `LocalDatabase`). `index.ts` is the only place that calls these with the
 * real globals.
 */
import {
  ATTACHMENT_LRU_CACHE_NAME,
  ATTACHMENT_LRU_MAX_ENTRIES,
  tripCacheName,
} from '@rv-checklist/domain';

/** The page cache navigations already warm (see `index.ts`'s `NetworkFirst` rule). */
const PAGES_CACHE_NAME = 'rv-checklist-pages';

/** Every cache this module writes attachment bytes into, trip caches or the LRU. */
const ATTACHMENT_CACHE_PREFIX = 'attachments-';

/** The subset of the `Cache` interface this module needs. */
export interface MinimalCache {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response): Promise<void>;
  delete(request: string): Promise<boolean>;
  keys(): Promise<readonly { readonly url: string }[]>;
}

/**
 * The subset of the `CacheStorage` interface this module needs — including
 * its own `keys()` (cache *names*, not entries — the real `CacheStorage`
 * overloads the word) and `match()`, which the real API already resolves
 * against every cache this origin owns, so eviction and cache-first lookup
 * never need to know which named cache holds an attachment.
 */
export interface MinimalCacheStorage {
  open(cacheName: string): Promise<MinimalCache>;
  has(cacheName: string): Promise<boolean>;
  delete(cacheName: string): Promise<boolean>;
  keys(): Promise<readonly string[]>;
  match(request: string): Promise<Response | undefined>;
}

/** A `fetch`-shaped function, injected so tests never hit the network. */
export type Fetcher = (url: string) => Promise<Response>;

/** What to warm for one trip: its pages and its attachments, in fetch order. */
export interface TripWarmRequest {
  readonly routeUrls: readonly string[];
  readonly attachmentUrls: readonly string[];
}

/**
 * Fetch and cache a single url into `cache`, unless it is already there — the
 * "SW skips ids already cached" rule from the issue, which is what makes a
 * repeated warm (trigger (b), or two overlapping triggers) cheap. A failed
 * fetch is swallowed: warming is best-effort, and one bad attachment must not
 * stop the rest of the trip (or the routes) from caching.
 */
async function warmOne(
  cache: MinimalCache,
  url: string,
  fetcher: Fetcher,
): Promise<void> {
  const existing = await cache.match(url);
  if (existing !== undefined) return;
  try {
    const response = await fetcher(url);
    if (response.ok) {
      await cache.put(url, response);
    }
  } catch {
    // Off grid mid-warm, or the byte range vanished server-side — the next
    // trigger (reconnect, app reopen) retries it. Nothing to surface here;
    // warming has no UI of its own.
  }
}

/**
 * Warm one trip: its routes into the shared pages cache (so the dashboard and
 * trip detail render offline even before the owner has opened them) and its
 * attachments — campground maps first, per the caller's ordering — into the
 * trip-scoped cache that {@link dropTrip} deletes whole.
 */
export async function cacheTrip(
  caches: MinimalCacheStorage,
  tripId: string,
  request: TripWarmRequest,
  fetcher: Fetcher,
): Promise<void> {
  const [pages, attachments] = await Promise.all([
    caches.open(PAGES_CACHE_NAME),
    caches.open(tripCacheName(tripId)),
  ]);

  // Sequential, not `Promise.all`: campground maps first only means something
  // if the earlier fetches are given the chance to land before the later
  // ones, on the metered/patchy connection this exists for.
  for (const url of request.routeUrls) {
    await warmOne(pages, url, fetcher);
  }
  for (const url of request.attachmentUrls) {
    await warmOne(attachments, url, fetcher);
  }
}

/** A trip stopped being current — drop its whole warmed cache in one call. */
export async function dropTrip(
  caches: MinimalCacheStorage,
  tripId: string,
): Promise<void> {
  await caches.delete(tripCacheName(tripId));
}

/**
 * An attachment is gone — deleted, or its metadata row disappeared from the
 * local store. It could be in the current trip's cache, a past trip's cache
 * that has not been dropped yet, or the browsed-attachment LRU; delete it
 * from every `attachments-*` cache rather than tracking which one holds it.
 */
export async function evictAttachment(
  caches: MinimalCacheStorage,
  attachmentUrl: string,
): Promise<void> {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(ATTACHMENT_CACHE_PREFIX))
      .map(async (name) => {
        const cache = await caches.open(name);
        await cache.delete(attachmentUrl);
      }),
  );
}

/**
 * Serve `/attachments/*` cache-first (ADR-0028's "Read" decision): the bytes
 * are immutable once uploaded, so any cached copy — trip cache or LRU — is
 * always the right answer. A miss falls back to the network and remembers
 * the result in the LRU cache only (a trip cache is populated exclusively by
 * a warm, never by ordinary browsing), evicting the oldest entry once the
 * cache grows past {@link ATTACHMENT_LRU_MAX_ENTRIES}.
 */
export async function respondToAttachment(
  caches: MinimalCacheStorage,
  attachmentUrl: string,
  fetcher: Fetcher,
): Promise<Response> {
  const cached = await caches.match(attachmentUrl);
  if (cached !== undefined) return cached;

  const response = await fetcher(attachmentUrl);
  if (response.ok) {
    const lru = await caches.open(ATTACHMENT_LRU_CACHE_NAME);
    await lru.put(attachmentUrl, response.clone());
    await evictOldest(lru);
  }
  return response;
}

async function evictOldest(lru: MinimalCache): Promise<void> {
  const keys = await lru.keys();
  if (keys.length <= ATTACHMENT_LRU_MAX_ENTRIES) return;
  const oldest = keys[0];
  if (oldest !== undefined) await lru.delete(oldest.url);
}

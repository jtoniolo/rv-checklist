/*
 * The service worker's half of the client-to-SW message protocol (ADR-0028,
 * issue #151): validates whatever a `message` event handed it — `event.data`
 * is `any` at the type level, and the worker is not the only listener a bad
 * actor could message — and dispatches to the cache mechanics in
 * `attachment-cache.ts`.
 */
import type { SwMessage } from '@rv-checklist/domain';
import {
  cacheTrip,
  dropTrip,
  evictAttachment,
  type Fetcher,
  type MinimalCacheStorage,
} from './attachment-cache.js';

/** Every `SwMessage.type` value — what {@link isSwMessage} checks membership against. */
const SW_MESSAGE_TYPES: ReadonlySet<SwMessage['type']> = new Set([
  'rv-checklist/cache-trip',
  'rv-checklist/drop-trip',
  'rv-checklist/evict-attachment',
]);

/**
 * A structural, not exhaustive, check: enough to route the message safely,
 * not a full schema validation (there is nothing sensitive or persisted on
 * the other side of a bad message — at worst, nothing gets cached).
 */
function isSwMessage(data: unknown): data is SwMessage {
  if (typeof data !== 'object' || data === null) return false;
  const type = (data as { type?: unknown }).type;
  return SW_MESSAGE_TYPES.has(type as SwMessage['type']);
}

/** Route one `message` event's data to the matching cache operation. */
export async function handleSwMessage(
  caches: MinimalCacheStorage,
  data: unknown,
  fetcher: Fetcher,
): Promise<void> {
  if (!isSwMessage(data)) return;

  switch (data.type) {
    case 'rv-checklist/cache-trip': {
      await cacheTrip(
        caches,
        data.tripId,
        { routeUrls: data.routeUrls, attachmentUrls: data.attachmentUrls },
        fetcher,
      );
      return;
    }
    case 'rv-checklist/drop-trip': {
      await dropTrip(caches, data.tripId);
      return;
    }
    case 'rv-checklist/evict-attachment': {
      await evictAttachment(caches, data.attachmentUrl);
      return;
    }
  }
}

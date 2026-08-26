import type { Attachment } from './attachment.js';

/**
 * Current-trip warming (ADR-0028, issue #151): the shared piece of the
 * client-to-service-worker message protocol — the part every side (the
 * browser tab posting the message and the worker consuming it) must agree on
 * byte-for-byte, since it crosses a `postMessage` boundary with no compiler
 * to check it. The worker itself lives outside this lib's compile target
 * (`apps/web/sw`, `webworker` lib, no DOM) but already depends on this
 * package, so the message shapes have exactly one definition instead of two
 * copies drifting apart.
 */

/** The cache warmed proactively when a trip becomes/stays current. */
export function tripCacheName(tripId: string): string {
  return `attachments-trip-${tripId}`;
}

/** The runtime LRU cache for attachments opened outside the current trip. */
export const ATTACHMENT_LRU_CACHE_NAME = 'attachments-lru';

/** How many browsed-but-not-current attachments the LRU cache keeps. */
export const ATTACHMENT_LRU_MAX_ENTRIES = 50;

/**
 * Warm the current trip's routes and every one of its attachments —
 * campground maps first, so a truncated warm (device goes off grid mid-fetch)
 * still leaves the one attachment the owner needs most.
 */
export interface CacheTripMessage {
  readonly type: 'rv-checklist/cache-trip';
  readonly tripId: string;
  /** Page URLs to warm, e.g. the rig dashboard and this trip's detail page. */
  readonly routeUrls: readonly string[];
  /** Attachment download URLs, campground maps first (see {@link orderAttachmentsForWarming}). */
  readonly attachmentUrls: readonly string[];
}

/** A trip stopped being current — drop its whole warmed cache. */
export interface DropTripMessage {
  readonly type: 'rv-checklist/drop-trip';
  readonly tripId: string;
}

/**
 * An attachment's bytes are gone (deleted, or its metadata row disappeared
 * from the local store) — evict it from every cache it might be in, trip
 * cache or LRU.
 */
export interface EvictAttachmentMessage {
  readonly type: 'rv-checklist/evict-attachment';
  readonly attachmentUrl: string;
}

/** Every message a client tab can post to the service worker (issue #151). */
export type SwMessage =
  CacheTripMessage | DropTripMessage | EvictAttachmentMessage;

/**
 * Order a stop or trip's attachments the way a warm should fetch them:
 * campground maps first (the one thing the owner needs to find the site),
 * everything else after, each group in its given order (a stable sort — the
 * upload order the API and the local store both already produce).
 */
export function orderAttachmentsForWarming(
  attachments: readonly Attachment[],
): Attachment[] {
  const maps = attachments.filter((a) => a.isCampgroundMap);
  const rest = attachments.filter((a) => !a.isCampgroundMap);
  return [...maps, ...rest];
}

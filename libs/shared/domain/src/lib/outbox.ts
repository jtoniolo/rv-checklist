/**
 * The offline attachment outbox (ADR-0028, issue #152): an offline capture —
 * blob, stop id, its own client-generated id (#143) — waits in IndexedDB
 * until one-shot Background Sync (or the app itself, once reopened) replays
 * it as the ordinary multipart upload.
 *
 * This module holds only what both sides of that split must agree on
 * byte-for-byte: the database schema (name/store/version), the tag one-shot
 * Background Sync is registered under, the broadcast protocol the worker
 * uses to tell any open tab what just happened, and the pure decision of
 * what an upload response means for the queued entry. The two IndexedDB
 * adapters themselves — `libs/web/data-access/src/lib/outbox/outbox-db.ts`
 * (the page: writes captures, renders badges) and `apps/web/sw/outbox-store.ts`
 * (the worker: replays them) — stay separate files, the same split
 * `attachment-cache.ts` / `sw-warming.ts` already uses for current-trip
 * warming, because each runs in an environment with different `lib` types
 * (`dom` vs `webworker`) that this package (built with neither) cannot
 * reference directly.
 */

/** The IndexedDB database both sides open. */
export const OUTBOX_DB_NAME = 'rv-checklist-outbox';
/** The one object store, keyed by the attachment's client-generated id. */
export const OUTBOX_STORE_NAME = 'entries';
/** The index used to list one stop's queued captures. */
export const OUTBOX_STOP_INDEX = 'by-stopId';
export const OUTBOX_DB_VERSION = 1;

/** The Background Sync tag the page registers and the worker listens for. */
export const ATTACHMENT_OUTBOX_SYNC_TAG = 'rv-checklist/attachment-outbox';

/** The `BroadcastChannel` name both the page and the worker open. */
export const OUTBOX_BROADCAST_CHANNEL = 'rv-checklist-outbox';

/** An outbox entry's lifecycle: queued, or stuck on a failure the owner must act on. */
export type OutboxEntryStatus = 'pending' | 'failed';

/**
 * What one flush attempt's HTTP response means for the queued entry — the
 * pure decision `outbox-flush.ts` is built around, factored out here so it is
 * testable without a fetch or an IndexedDB in sight.
 *
 * - `success`: uploaded — drop the entry.
 * - `retry`: transient (network/5xx/429), or the stop this capture belongs to
 *   has not synced up from this device yet — a 404 from the upload endpoint
 *   can only mean "stop not found" (`AttachmentService.upload`'s only 404),
 *   which ADR-0028's ordering rule says to leave queued rather than fail.
 *   Leave the entry pending for the next Background Sync attempt.
 * - `auth-required`: the session sync uses is dead. Hold the *whole* outbox
 *   behind the "sign in to sync" banner (#149) rather than failing this one
 *   entry.
 * - `failed`: any other 4xx — bad type, empty file, oversized. Client-side
 *   validation should have caught it before it queued, but the server is the
 *   final word, and retrying the same bytes verbatim can never succeed.
 */
export type OutboxUploadOutcome =
  'success' | 'retry' | 'auth-required' | 'failed';

/** Classify an upload response's status code (see {@link OutboxUploadOutcome}). */
export function classifyAttachmentUploadStatus(
  status: number,
): OutboxUploadOutcome {
  if (status >= 200 && status < 300) return 'success';
  if (status === 401) return 'auth-required';
  if (status === 404 || status === 429 || status >= 500) return 'retry';
  return 'failed';
}

/**
 * What the worker tells any open tab after a flush attempt changes an entry
 * — `outbox-updated` covers an entry uploading (dropped), failing (badged)
 * or being retried, so the page's badge list always re-lists rather than
 * trying to special-case each transition; `outbox-auth-required` is the
 * signal a listener turns into `setSyncAuthStatus('signed-out')` (#149),
 * reusing the one banner instead of a second path.
 */
export type OutboxBroadcastMessage =
  | { readonly type: 'rv-checklist/outbox-updated'; readonly stopId: string }
  | { readonly type: 'rv-checklist/outbox-auth-required' };

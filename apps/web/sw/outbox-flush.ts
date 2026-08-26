import {
  classifyAttachmentUploadStatus,
  type OutboxBroadcastMessage,
} from '@rv-checklist/domain';
import {
  deleteOutboxEntry,
  listPendingOutboxEntries,
  markOutboxEntryFailed,
  type OutboxEntry,
} from './outbox-store.js';

/**
 * The one-shot Background Sync flush (ADR-0028, issue #152): replay every
 * queued capture as the ordinary multipart `POST /stops/:stopId/attachments`
 * — the client id (#143) makes a re-sent success idempotent, so a duplicate
 * `sync` event firing for the same tag lands on one row, not two.
 *
 * Entries are independent files, so one entry's outcome never blocks another
 * — a stop still mid-sync-up ("stop not found", retryable) does not stop a
 * different stop's capture from uploading in the same pass. The one
 * exception is `auth-required` (ADR-0028: "hold the *whole* outbox"): every
 * later entry would fail the same way, so that stops the loop rather than
 * burning through the rest.
 *
 * Whether the caller (`index.ts`'s `sync` listener) should tell Background
 * Sync to retry is the return value, not a throw — a service worker's `sync`
 * handler is expected to reject on "try again later", but a plain boolean is
 * far easier to unit test than asserting on a rejection.
 */
export interface FlushOutcome {
  /** `true` when at least one entry is still queued and should be retried. */
  readonly shouldRetry: boolean;
}

export interface FlushDeps {
  readonly db: IDBDatabase;
  readonly apiBaseUrl: string;
  readonly fetcher: typeof fetch;
  readonly broadcast: (message: OutboxBroadcastMessage) => void;
}

/** Build the multipart body the upload endpoint expects (issue #143's `id`/`isCampgroundMap` fields). */
function toFormData(entry: OutboxEntry): FormData {
  const body = new FormData();
  body.append('file', entry.blob, entry.filename);
  body.append('id', entry.id);
  body.append('isCampgroundMap', String(entry.isCampgroundMap));
  return body;
}

/** `POST /auth/refresh`, resolving `false` on any non-2xx or network failure. */
async function refreshSession(
  deps: Pick<FlushDeps, 'apiBaseUrl' | 'fetcher'>,
): Promise<boolean> {
  try {
    const response = await deps.fetcher(`${deps.apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** The message a failed badge shows — the server's own, when it sent one, else a fallback. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.clone().json();
    if (
      body !== null &&
      typeof body === 'object' &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      return body.message;
    }
  } catch {
    // Not JSON, or already consumed — fall through to the generic message.
  }
  return `Upload failed (${String(response.status)})`;
}

/**
 * One entry's attempt: send it, refresh-and-retry once on a 401 (mirroring
 * `connector.ts`'s own connector — a page-side `send`, this being the
 * worker's), and turn the response into the same {@link OutboxUploadOutcome}
 * either way. A thrown fetch (offline mid-flush) is `retry`, exactly like a
 * 5xx.
 */
async function attemptUpload(
  deps: FlushDeps,
  entry: OutboxEntry,
): Promise<
  | { readonly outcome: 'success' | 'retry' | 'auth-required' }
  | { readonly outcome: 'failed'; readonly message: string }
> {
  const url = `${deps.apiBaseUrl}/stops/${entry.stopId}/attachments`;
  let response: Response;
  try {
    response = await deps.fetcher(url, {
      method: 'POST',
      credentials: 'include',
      body: toFormData(entry),
    });
  } catch {
    return { outcome: 'retry' };
  }

  if (response.status === 401 && (await refreshSession(deps))) {
    try {
      response = await deps.fetcher(url, {
        method: 'POST',
        credentials: 'include',
        body: toFormData(entry),
      });
    } catch {
      return { outcome: 'retry' };
    }
  }

  const outcome = classifyAttachmentUploadStatus(response.status);
  if (outcome === 'failed') {
    return { outcome, message: await readErrorMessage(response) };
  }
  return { outcome };
}

/** Flush every pending entry once. See the module comment for the ordering rules. */
export async function flushOutbox(deps: FlushDeps): Promise<FlushOutcome> {
  const entries = await listPendingOutboxEntries(deps.db);
  let shouldRetry = false;

  for (const entry of entries) {
    const result = await attemptUpload(deps, entry);

    if (result.outcome === 'auth-required') {
      deps.broadcast({ type: 'rv-checklist/outbox-auth-required' });
      return { shouldRetry: true };
    }

    if (result.outcome === 'success') {
      await deleteOutboxEntry(deps.db, entry.id);
      deps.broadcast({
        type: 'rv-checklist/outbox-updated',
        stopId: entry.stopId,
      });
      continue;
    }

    if (result.outcome === 'failed') {
      await markOutboxEntryFailed(deps.db, entry.id, result.message);
      deps.broadcast({
        type: 'rv-checklist/outbox-updated',
        stopId: entry.stopId,
      });
      continue;
    }

    // 'retry': left pending as-is.
    shouldRetry = true;
  }

  return { shouldRetry };
}

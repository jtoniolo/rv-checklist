import {
  ATTACHMENT_OUTBOX_SYNC_TAG,
  OUTBOX_BROADCAST_CHANNEL,
  type Id,
  type OutboxBroadcastMessage,
} from '@rv-checklist/domain';
import { useEffect, useState } from 'react';
import { setSyncAuthStatus } from '../powersync/sync-auth-status.js';
import {
  deleteOutboxEntry,
  enqueueOutboxEntry,
  listOutboxEntriesForStop,
  openOutboxDatabase,
  retryOutboxEntry,
  type OutboxEntry,
} from './outbox-db.js';

export type { OutboxEntry } from './outbox-db.js';

/** Whether this host can hold the outbox at all — same capability shape as `connectLocalDatabase`. */
function canHostOutbox(): boolean {
  return typeof indexedDB !== 'undefined';
}

/** Tell any open tab an entry changed — a new capture, an upload, a failure, a retry. */
function broadcastOutboxUpdated(stopId: Id): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const channel = new BroadcastChannel(OUTBOX_BROADCAST_CHANNEL);
  const message: OutboxBroadcastMessage = {
    type: 'rv-checklist/outbox-updated',
    stopId,
  };
  channel.postMessage(message);
  channel.close();
}

/**
 * Ask the browser to flush the outbox once connectivity returns, even if the
 * app is closed by then (ADR-0028). Best-effort: Background Sync is
 * Chromium-only, so a browser without it (or without an active worker yet)
 * silently gets nothing here — the capture still sits in IndexedDB and
 * uploads the next time the app itself is open and online.
 */
async function registerAttachmentOutboxSync(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    if ('sync' in registration) {
      await (
        registration as ServiceWorkerRegistration & {
          sync: { register: (tag: string) => Promise<void> };
        }
      ).sync.register(ATTACHMENT_OUTBOX_SYNC_TAG);
    }
  } catch {
    // No worker registered (dev mode), or the browser refused the
    // registration — nothing to do; the reopen-the-app path still works.
  }
}

/** What a new capture needs; the outbox mints the id, the status and the timestamp. */
export interface AttachmentCapture {
  readonly stopId: Id;
  readonly tripId: Id;
  readonly rigId: Id;
  readonly file: File;
  readonly isCampgroundMap?: boolean;
}

/**
 * Queue an offline capture (ADR-0028): written to IndexedDB with its own
 * client-generated id (#143, so the eventual replay lands on one row),
 * broadcast to any open tab so its badge list picks it up immediately, and
 * registered for Background Sync so a closed app still uploads it once
 * connectivity returns.
 *
 * Returns `undefined` on a host that cannot hold IndexedDB — there is
 * nowhere to queue the capture; the caller falls back to reporting the
 * upload as failed outright rather than losing the file silently.
 */
export async function enqueueAttachmentCapture(
  capture: AttachmentCapture,
): Promise<OutboxEntry | undefined> {
  if (!canHostOutbox()) return undefined;
  const db = await openOutboxDatabase();
  const entry = await enqueueOutboxEntry(db, {
    id: crypto.randomUUID(),
    stopId: capture.stopId,
    tripId: capture.tripId,
    rigId: capture.rigId,
    filename: capture.file.name,
    mimeType: capture.file.type,
    blob: capture.file,
    isCampgroundMap: capture.isCampgroundMap ?? false,
  });
  broadcastOutboxUpdated(capture.stopId);
  await registerAttachmentOutboxSync();
  return entry;
}

/** Discard a queued capture — a pending one (no server row exists yet) or a failed one. */
export async function discardOutboxAttachment(
  stopId: Id,
  id: Id,
): Promise<void> {
  if (!canHostOutbox()) return;
  const db = await openOutboxDatabase();
  await deleteOutboxEntry(db, id);
  broadcastOutboxUpdated(stopId);
}

/** Retry a failed capture: back to pending, and ask for another flush attempt. */
export async function retryOutboxAttachment(stopId: Id, id: Id): Promise<void> {
  if (!canHostOutbox()) return;
  const db = await openOutboxDatabase();
  await retryOutboxEntry(db, id);
  broadcastOutboxUpdated(stopId);
  await registerAttachmentOutboxSync();
}

/** One stop's queued captures — every status — for the "waiting to upload" / "failed" badges. */
async function readOutboxEntriesForStop(stopId: Id): Promise<OutboxEntry[]> {
  if (!canHostOutbox()) return [];
  const db = await openOutboxDatabase();
  return listOutboxEntriesForStop(db, stopId);
}

/**
 * Live outbox entries for one stop — loaded on mount, and re-loaded whenever
 * this tab or the worker (a flush attempt landing) broadcasts a change for
 * this stop. Starts empty so server render and first client render agree.
 */
export function useOutboxEntriesForStop(stopId: Id): readonly OutboxEntry[] {
  const [entries, setEntries] = useState<readonly OutboxEntry[]>([]);

  useEffect(() => {
    let isCancelled = false;
    const load = (): void => {
      void readOutboxEntriesForStop(stopId).then((next) => {
        if (!isCancelled) setEntries(next);
      });
    };
    load();

    if (typeof BroadcastChannel === 'undefined') {
      return () => {
        isCancelled = true;
      };
    }
    const channel = new BroadcastChannel(OUTBOX_BROADCAST_CHANNEL);
    channel.addEventListener(
      'message',
      (event: MessageEvent<OutboxBroadcastMessage>) => {
        if (
          event.data.type === 'rv-checklist/outbox-updated' &&
          event.data.stopId === stopId
        ) {
          load();
        }
      },
    );
    return () => {
      isCancelled = true;
      channel.close();
    };
  }, [stopId]);

  return entries;
}

/**
 * The worker's 401 (`outbox-flush.ts`) is a signal from an execution context
 * that cannot reach `sync-auth-status.ts`'s own in-page singleton directly
 * (a service worker is a different realm). This bridges the two: listen for
 * the broadcast and drive the *same* `setSyncAuthStatus` the page-side
 * connector uses, so the "sign in to sync" banner (#149) is the one path
 * both a domain-write 401 and an attachment 401 render through.
 */
export function useAttachmentOutboxAuthBridge(): void {
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(OUTBOX_BROADCAST_CHANNEL);
    channel.addEventListener(
      'message',
      (event: MessageEvent<OutboxBroadcastMessage>) => {
        if (event.data.type === 'rv-checklist/outbox-auth-required') {
          setSyncAuthStatus('signed-out');
        }
      },
    );
    return () => {
      channel.close();
    };
  }, []);
}

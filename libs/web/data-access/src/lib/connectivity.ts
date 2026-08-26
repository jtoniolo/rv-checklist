import { useEffect, useState } from 'react';
import { connectLocalDatabase } from './powersync/browser-store.js';
import type { LocalDatabase } from './powersync/local-store.js';

/**
 * Whether the device is off grid, for the app-wide offline indicator
 * (issue #153; CONTEXT.md, "Offline indicator"). Offline is a mode, not a
 * failure, so nothing here throws or errors — it answers a boolean.
 *
 * Two signals, combined because neither is enough on its own:
 *
 * 1. **The sync client's connection state**, reached through the same
 *    `LocalDatabase` seam as the read path so no component imports PowerSync
 *    (ADR-0029, decision 6). This is the truthful one: it says whether
 *    replication is actually flowing, which `navigator.onLine` cannot tell you
 *    behind a captive portal.
 * 2. **The browser's `online`/`offline` events.** The fallback, and the only
 *    signal there is when the app has no local store at all — a signed-out
 *    visitor, a host without IndexedDB or Worker, a failed open. Those all look
 *    alike at the seam and none of them means the device is offline, so a
 *    missing store must never light the indicator by itself.
 */

/**
 * Report when the sync client loses a connection it previously had. Returns a
 * dispose function.
 *
 * `notify(true)` means replication was flowing and has stopped; `notify(false)`
 * means it is flowing again. Nothing is reported until the first connection
 * succeeds, deliberately: the sync client starts disconnected and takes a round
 * trip to connect, so reading that initial `false` as "offline" would flash the
 * indicator on every page load. A store that never connects at all is left to
 * the browser events — ADR-0029 lists several benign reasons for it that are
 * not "off grid".
 */
export function observeSyncConnection(
  notify: (hasLostConnection: boolean) => void,
  open: () => Promise<LocalDatabase | undefined> = connectLocalDatabase,
): () => void {
  let isDisposed = false;
  let unsubscribe: (() => void) | undefined;
  let hasConnected = false;

  void open()
    .then((database) => {
      if (database === undefined || isDisposed) return;
      unsubscribe = database.onConnectionChange((isConnected) => {
        if (isConnected) hasConnected = true;
        else if (!hasConnected) return;
        notify(!isConnected);
      });
    })
    .catch(() => {
      // No local store on this page. The watch path already reports a failed
      // open once per page; the browser events carry the indicator without it.
    });

  return (): void => {
    isDisposed = true;
    unsubscribe?.();
  };
}

/**
 * Report every time the sync client regains a connection it had previously
 * lost (issue #154) — never the first connect of a page load, which is not a
 * reconnect and would otherwise re-fetch every qualifying leg on every visit.
 * Returns a dispose function.
 *
 * This is deliberately a weaker signal than "the write queue has fully
 * replayed": PowerSync exposes only the connection state (see
 * `LocalDatabase.onConnectionChange`), not an upload-drained event. A
 * reconnect-triggered fetch is best-effort and re-runs `canAutoFillLeg`'s
 * guards regardless, so an upload still mid-flight simply means the stop or
 * its place ID is not there yet and the fetch is skipped, not wrong.
 */
export function observeSyncReconnect(
  notify: () => void,
  open: () => Promise<LocalDatabase | undefined> = connectLocalDatabase,
): () => void {
  let isDisposed = false;
  let unsubscribe: (() => void) | undefined;
  let hasConnectedBefore = false;
  let hasLostConnection = false;

  void open()
    .then((database) => {
      if (database === undefined || isDisposed) return;
      unsubscribe = database.onConnectionChange((isConnected) => {
        if (isConnected) {
          if (hasConnectedBefore && hasLostConnection) {
            hasLostConnection = false;
            notify();
          }
          hasConnectedBefore = true;
        } else if (hasConnectedBefore) {
          hasLostConnection = true;
        }
      });
    })
    .catch(() => {
      // No local store on this page — nothing to reconnect.
    });

  return (): void => {
    isDisposed = true;
    unsubscribe?.();
  };
}

/** `true` while the device cannot reach the server. See the module comment. */
export function useIsOffline(): boolean {
  // Both start "online" rather than reading `navigator.onLine` in the
  // initialiser: there is no navigator during the server render, and a first
  // client render that disagreed with the server HTML is a hydration mismatch.
  // The effects below correct it on mount, before paint.
  const [isBrowserOffline, setIsBrowserOffline] = useState(false);
  const [hasLostSync, setHasLostSync] = useState(false);

  useEffect(() => {
    const read = (): void => {
      setIsBrowserOffline(!navigator.onLine);
    };
    read();
    globalThis.addEventListener('online', read);
    globalThis.addEventListener('offline', read);
    return (): void => {
      globalThis.removeEventListener('online', read);
      globalThis.removeEventListener('offline', read);
    };
  }, []);

  useEffect(() => observeSyncConnection(setHasLostSync), []);

  return isBrowserOffline || hasLostSync;
}

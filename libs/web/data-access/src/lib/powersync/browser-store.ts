import type { LocalDatabase } from './local-store.js';

/**
 * The two guarded ways into the browser's local store (ADR-0029). The SDK is
 * loaded from here and nowhere else: the import is dynamic and guarded, so the
 * server render — where the endpoint lifecycles also run — never pulls in a
 * Worker, wasm or IndexedDB, and online first paint is unchanged.
 *
 * The guard is a capability check, not a `typeof window` check. wa-sqlite needs
 * all four of these, so a host missing any of them cannot hold a local store
 * and the read path falls back to the network. That covers the server render,
 * jsdom and node under test, and any browser with the storage APIs disabled.
 */
function canHostLocalStore(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof indexedDB !== 'undefined' &&
    typeof WebAssembly !== 'undefined'
  );
}

/** Open the signed-in owner's local database, or report that there isn't one. */
export async function connectLocalDatabase(): Promise<
  LocalDatabase | undefined
> {
  if (!canHostLocalStore()) return undefined;
  const { openLocalDatabase } = await import('./client.js');
  return openLocalDatabase();
}

/**
 * Release the local store when the session changes. Sign-out passes
 * `clear: true`, which deletes the replicated rows; a fresh sign-in passes
 * `clear: false` and only drops the handle. Never rejects — the session has
 * already changed by the time this runs, and there is nothing useful for the
 * caller to do about a store that will not close.
 */
export async function resetLocalStore({
  clear,
}: {
  clear: boolean;
}): Promise<void> {
  if (!canHostLocalStore()) return;
  try {
    const { resetLocalDatabase } = await import('./client.js');
    await resetLocalDatabase({ clear });
  } catch {
    // The SDK never loaded, or the store was already gone.
  }
}

import type { LocalDatabase, LocalQuery } from './local-store.js';

/**
 * Streams a local query's results into one RTK Query cache entry (ADR-0029).
 * Every syncable endpoint calls this from `onCacheEntryAdded`, which gives it
 * a lifetime bounded by the entry's own subscriptions.
 *
 * Two rules make this work where the documented pattern does not:
 *
 * 1. **The watch does not wait for `cacheDataLoaded`.** Awaiting it is the
 *    documented shape and it is exactly wrong here — offline the entry's own
 *    fetch rejects, the await never settles, and the watch never opens in the
 *    one case it exists for. The watch opens immediately and tears down on
 *    `cacheEntryRemoved`.
 *
 * 2. **Nothing is emitted before replication has run once.** A watch over an
 *    empty local store answers `[]`, which is indistinguishable from "not
 *    synced yet"; emitting that over a good SSR seed puts an empty list on
 *    first paint and undoes Pattern C (ADR-0018). `waitForFirstSync` is
 *    already satisfied on a returning device, so an offline cold boot still
 *    emits — it is a first-run gate, not an online gate.
 *
 * Results reach the cache through `upsertQueryEntries` (the caller supplies
 * the dispatch), never `updateCachedData`: the latter needs an existing `data`
 * value and so cannot populate a pending or rejected entry, which is the
 * offline case.
 */
export interface WatchIntoCacheOptions<Result> {
  /** What to read from the local store, and what makes it stale. */
  readonly query: LocalQuery<Result>;
  /** Push a result into the cache entry. Called once per accepted emission. */
  readonly emit: (value: Result) => void;
  /** The lifecycle's `cacheEntryRemoved`; resolving tears the watch down. */
  readonly removed: Promise<void>;
  /** Overridden in tests; defaults to the browser's local database. */
  readonly open?: () => Promise<LocalDatabase | undefined>;
}

export async function watchIntoCache<Result>({
  query,
  emit,
  removed,
  open = connectLocalDatabase,
}: WatchIntoCacheOptions<Result>): Promise<void> {
  const teardown = new AbortController();
  // Read through a call so the checks below see the live flag: the signal can
  // abort during any of the awaits.
  const isTornDown = (): boolean => teardown.signal.aborted;
  void removed.then(() => {
    teardown.abort();
  });

  const database = await open();
  if (database === undefined || isTornDown()) return;

  await database.waitForFirstSync(teardown.signal);
  if (isTornDown()) return;

  let latest = 0;
  const push = async (): Promise<void> => {
    const emission = ++latest;
    const value = await query.run(database.store);
    // A read overtaken while it was in flight must not land on the newer one.
    if (emission !== latest || isTornDown()) return;
    if (value !== undefined) emit(value);
  };
  const run = (): void => {
    void push().catch(() => {
      // A failed read leaves the cache entry as the network or the seed left
      // it, and the watch stays open for the next change.
    });
  };

  const dispose = database.onChange(query.tables, run);
  run();
  await removed;
  dispose();
}

/**
 * Open the browser's local database, or report that there isn't one. The SDK
 * is loaded here and nowhere else: the import is dynamic and guarded, so the
 * server render — where this lifecycle also runs — never pulls in a Worker,
 * wasm or IndexedDB, and online first paint is unchanged.
 *
 * The guard is a capability check, not a `typeof window` check. wa-sqlite
 * needs all four of these, so a host missing any of them cannot hold a local
 * store and the read path falls back to the network. That covers the server
 * render, jsdom under test, and any browser with the storage APIs disabled.
 */
async function connectLocalDatabase(): Promise<LocalDatabase | undefined> {
  const canHostLocalStore =
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof indexedDB !== 'undefined' &&
    typeof WebAssembly !== 'undefined';
  if (!canHostLocalStore) return undefined;

  const { openLocalDatabase } = await import('./client.js');
  return openLocalDatabase();
}

import { connectLocalDatabase } from './browser-store.js';
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

/**
 * Say once, per page, that the local store could not be opened. Falling back to
 * the network is the right behaviour for a transient failure, but two very
 * different things arrive here: an access cookie that expired between page
 * loads, which fixes itself, and a deployment whose `/@powersync/worker.js`
 * never shipped, which fails for every visitor on every entry forever. A silent
 * fallback makes the second look exactly like the first — the app works, only
 * offline never does. Reported once because the same failure repeats for each
 * of the eleven watched entries, and never rethrown.
 */
const reportFailedOpen = createFailedOpenReporter();

function createFailedOpenReporter(): (error: unknown) => void {
  let hasReported = false;
  return (error) => {
    if (hasReported) return;
    hasReported = true;
    console.warn(
      'PowerSync: the local store could not be opened; reading from the network. Offline reads are unavailable on this page.',
      error,
    );
  };
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

  let database: LocalDatabase | undefined;
  try {
    database = await open();
  } catch (error) {
    // A failed open is a missing local store, not a failed watch. It rejects
    // for reasons outside this path — the worker fetch answered with a
    // redirect once the access cookie has expired, a CSP that blocks wasm,
    // OPFS unavailable — and the rejection would otherwise leave
    // `onCacheEntryAdded` with a rejected promise that RTK Query rethrows:
    // one unhandled rejection per watched entry, for the life of the page.
    // Swallowed, but not in silence — see `reportFailedOpen`.
    reportFailedOpen(error);
  }
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

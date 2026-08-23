import type { LocalDatabase, LocalQuery, LocalStore } from './local-store.js';
import { watchIntoCache } from './watch.js';

/**
 * The watch-to-cache reducer (ADR-0029) against a fake local database. These
 * are the rules the rest of the offline read path rests on: no emission before
 * first sync, a watch that opens without waiting for the entry's own fetch,
 * and a teardown bound to `cacheEntryRemoved`.
 */

interface FakeDatabase extends LocalDatabase {
  /** Complete the first sync, releasing anything waiting on the gate. */
  completeFirstSync: () => void;
  /** Fire a change on the watched tables. */
  change: () => void;
  readonly watchedTables: string[][];
  readonly disposed: () => number;
}

function fakeDatabase({ synced = false } = {}): FakeDatabase {
  let hasSynced = synced;
  let releaseSync: (() => void) | undefined;
  const listeners: (() => void)[] = [];
  const watchedTables: string[][] = [];
  let disposals = 0;

  const waitForFirstSync = (signal: AbortSignal): Promise<void> => {
    if (hasSynced) return Promise.resolve();
    return new Promise<void>((resolve) => {
      releaseSync = resolve;
      signal.addEventListener('abort', () => {
        resolve();
      });
    });
  };

  const dispose = (): void => {
    disposals += 1;
  };

  return {
    store: { getAll: () => Promise.resolve([]) },
    waitForFirstSync,
    onChange: (tables, notify) => {
      watchedTables.push([...tables]);
      listeners.push(notify);
      return dispose;
    },
    clear: () => Promise.resolve(),
    close: () => Promise.resolve(),
    completeFirstSync: () => {
      hasSynced = true;
      releaseSync?.();
    },
    change: () => {
      for (const notify of listeners) notify();
    },
    watchedTables,
    disposed: () => disposals,
  };
}

/** A query that answers with whatever `results` holds when it is run. */
function countingQuery(results: {
  value: string[] | undefined;
}): LocalQuery<string[]> & { runs: number } {
  const query = {
    tables: ['rigs'] as const,
    runs: 0,
    run: (_store: LocalStore): Promise<string[] | undefined> => {
      query.runs += 1;
      return Promise.resolve(results.value);
    },
  };
  return query;
}

/** A `cacheEntryRemoved` that never resolves — the entry outlives the test. */
function neverRemoved(): Promise<void> {
  return new Promise<void>(() => {
    // Deliberately never settles.
  });
}

/** A `cacheEntryRemoved` and the call that resolves it. */
function removable(): { removed: Promise<void>; remove: () => void } {
  let remove!: () => void;
  // This lib targets ES2022, which has no `Promise.withResolvers`.
  // eslint-disable-next-line unicorn/prefer-promise-with-resolvers
  const removed = new Promise<void>((resolve) => {
    remove = resolve;
  });
  return { removed, remove };
}

/** Let every already-queued microtask settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('watchIntoCache', () => {
  it('emits nothing until replication has completed once', async () => {
    const database = fakeDatabase();
    const results = { value: ['first'] as string[] | undefined };
    const query = countingQuery(results);
    const emit = jest.fn();

    void watchIntoCache({
      query,
      emit,
      removed: neverRemoved(),
      open: () => Promise.resolve(database),
    });
    await settle();

    // An unsynced store answers `[]` for everything; emitting that would put
    // an empty list on top of a good SSR seed.
    expect(query.runs).toBe(0);
    expect(emit).not.toHaveBeenCalled();

    database.completeFirstSync();
    await settle();

    expect(emit).toHaveBeenCalledWith(['first']);
  });

  it('emits immediately when the device has already synced — the offline cold boot', async () => {
    const database = fakeDatabase({ synced: true });
    const emit = jest.fn();

    void watchIntoCache({
      query: countingQuery({ value: ['cached'] }),
      emit,
      // The entry's own fetch never settles offline; the watch must not be
      // waiting on it.
      removed: neverRemoved(),
      open: () => Promise.resolve(database),
    });
    await settle();

    expect(emit).toHaveBeenCalledWith(['cached']);
    expect(database.watchedTables).toEqual([['rigs']]);
  });

  it('re-emits on every change to a watched table', async () => {
    const database = fakeDatabase({ synced: true });
    const results = { value: ['one'] as string[] | undefined };
    const emit = jest.fn();

    void watchIntoCache({
      query: countingQuery(results),
      emit,
      removed: neverRemoved(),
      open: () => Promise.resolve(database),
    });
    await settle();

    results.value = ['one', 'two'];
    database.change();
    await settle();

    expect(emit).toHaveBeenNthCalledWith(1, ['one']);
    expect(emit).toHaveBeenNthCalledWith(2, ['one', 'two']);
  });

  it('skips an emission when the query reports no answer', async () => {
    const database = fakeDatabase({ synced: true });
    const emit = jest.fn();

    void watchIntoCache({
      query: countingQuery({ value: undefined }),
      emit,
      removed: neverRemoved(),
      open: () => Promise.resolve(database),
    });
    await settle();

    expect(emit).not.toHaveBeenCalled();
  });

  it('tears the watch down when the cache entry is removed', async () => {
    const database = fakeDatabase({ synced: true });
    const emit = jest.fn();
    const { removed, remove } = removable();

    const watching = watchIntoCache({
      query: countingQuery({ value: ['one'] }),
      emit,
      removed,
      open: () => Promise.resolve(database),
    });
    await settle();
    remove();
    await watching;

    expect(database.disposed()).toBe(1);

    database.change();
    await settle();
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('opens no watch when the entry is removed while the first sync is still pending', async () => {
    const database = fakeDatabase();
    const emit = jest.fn();
    const { removed, remove } = removable();

    const watching = watchIntoCache({
      query: countingQuery({ value: ['one'] }),
      emit,
      removed,
      open: () => Promise.resolve(database),
    });
    await settle();
    remove();
    await watching;

    expect(database.watchedTables).toEqual([]);
    expect(emit).not.toHaveBeenCalled();
  });

  it('does nothing when there is no local database — the server render', async () => {
    const emit = jest.fn();

    await watchIntoCache({
      query: countingQuery({ value: ['one'] }),
      emit,
      removed: neverRemoved(),
      open: () => Promise.resolve(undefined),
    });

    expect(emit).not.toHaveBeenCalled();
  });

  it('discards a read that a newer one overtook', async () => {
    const database = fakeDatabase({ synced: true });
    const emit = jest.fn();
    const pending: ((value: string[]) => void)[] = [];
    const query: LocalQuery<string[]> = {
      tables: ['rigs'],
      run: () =>
        new Promise<string[]>((resolve) => {
          pending.push(resolve);
        }),
    };

    void watchIntoCache({
      query,
      emit,
      removed: neverRemoved(),
      open: () => Promise.resolve(database),
    });
    await settle();
    database.change();
    await settle();

    // Two reads are in flight; the one started first resolves last. Only the
    // newest result may reach the cache.
    expect(pending).toHaveLength(2);
    pending[1]?.(['newest']);
    pending[0]?.(['stale']);
    await settle();

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(['newest']);
  });

  it('does not propagate a failed open — it would be an unhandled rejection per entry', async () => {
    const emit = jest.fn();
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);

    // The real failures: the SDK's worker fetch answered with a redirect once
    // the access cookie has expired, a CSP that blocks wasm, OPFS unavailable.
    // RTK Query rethrows whatever `onCacheEntryAdded` rejects with, so a
    // rejection here becomes one unhandled rejection for every watched entry,
    // for the life of the page.
    const watching = watchIntoCache({
      query: countingQuery({ value: ['one'] }),
      emit,
      removed: neverRemoved(),
      open: () =>
        Promise.reject(
          new Error('Failed to construct Worker: /@powersync/worker.js'),
        ),
    });

    await expect(watching).resolves.toBeUndefined();
    await settle();
    process.off('unhandledRejection', unhandled);

    expect(emit).not.toHaveBeenCalled();
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('keeps watching after a failed read rather than killing the entry', async () => {
    const database = fakeDatabase({ synced: true });
    const emit = jest.fn();
    let shouldFail = true;
    const query: LocalQuery<string[]> = {
      tables: ['rigs'],
      run: () =>
        shouldFail
          ? Promise.reject(new Error('local read failed'))
          : Promise.resolve(['recovered']),
    };

    void watchIntoCache({
      query,
      emit,
      removed: neverRemoved(),
      open: () => Promise.resolve(database),
    });
    await settle();
    expect(emit).not.toHaveBeenCalled();

    shouldFail = false;
    database.change();
    await settle();

    expect(emit).toHaveBeenCalledWith(['recovered']);
  });
});

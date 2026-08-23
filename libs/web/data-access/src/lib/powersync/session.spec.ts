import type { Rig } from '@rv-checklist/domain';
import type { LocalDatabase } from './local-store.js';
import { storeFilenameFor } from './owner.js';
import { rigsQuery } from './queries.js';
import { createLocalStoreSession } from './session.js';
import type { LocalRow } from './tables.js';
import { watchIntoCache } from './watch.js';

/**
 * Owner isolation across a sign-out and a user switch (ADR-0029, decision 10).
 *
 * The leak this guards against is not a single bad line: a store one owner has
 * synced answers `waitForFirstSync` immediately from persisted state, so the
 * moment a second owner's watch opens over it the previous owner's rows land
 * in the new owner's cache — and by decision 4 that emission leaves a
 * fulfilled entry, which outranks the new owner's own correct network
 * response.
 *
 * Jest has no IndexedDB, Worker or wasm, so the SQLite is a fake — but the
 * fake is the seam that matters: a set of *persistent* stores keyed by
 * filename, exactly as the browser's origin storage is, with the real
 * `createLocalStoreSession`, the real `rigsQuery` projection and the real
 * `watchIntoCache` running over it. What is approximated is wa-sqlite; what is
 * exercised is every decision that picks which store a watch reads.
 */

const OWNER_A = '550e8400-e29b-41d4-a716-446655441111';
const OWNER_B = '550e8400-e29b-41d4-a716-446655442222';

function rigRow(ownerId: string, nickname: string): LocalRow<'rigs'> {
  return {
    id: `rig-${nickname}`,
    owner_id: ownerId,
    vin: '1FDXE4FS1234567890',
    make: 'Airstream',
    model: 'Flying Cloud',
    year: 2021,
    nickname,
    // eslint-disable-next-line unicorn/no-null
    distance_km: null,
    // eslint-disable-next-line unicorn/no-null
    travel_height_mm: null,
    // eslint-disable-next-line unicorn/no-null
    length_mm: null,
    // eslint-disable-next-line unicorn/no-null
    combined_length_mm: null,
    // eslint-disable-next-line unicorn/no-null
    clearance_passenger_mm: null,
    // eslint-disable-next-line unicorn/no-null
    clearance_driver_mm: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

/** A change feed nothing ever fires on; disposing it is a no-op. */
function noDispose(): void {
  // Nothing to dispose.
}

/**
 * The browser's origin storage: SQLite files that outlive the page, keyed by
 * filename. Opening the same filename twice reads the same rows back.
 */
function originStorage() {
  const files = new Map<string, LocalRow<'rigs'>[]>();
  const opened: string[] = [];
  let disposals = 0;

  const openStore = (owner: string): Promise<LocalDatabase> => {
    const filename = storeFilenameFor(owner);
    opened.push(filename);
    let isLive = true;
    const dispose = (): Promise<void> => {
      isLive = false;
      disposals += 1;
      return Promise.resolve();
    };
    return Promise.resolve({
      store: {
        getAll: <Row>(): Promise<Row[]> => {
          if (!isLive) throw new Error(`${filename} is closed`);
          return Promise.resolve((files.get(filename) ?? []) as Row[]);
        },
      },
      // Already synced: this is a returning device, which is the case that
      // makes the leak instant rather than racy.
      waitForFirstSync: () => Promise.resolve(),
      onChange: () => noDispose,
      clear: () => {
        files.delete(filename);
        return dispose();
      },
      close: dispose,
    });
  };

  return {
    openStore,
    opened,
    disposals: () => disposals,
    seed: (owner: string, rows: LocalRow<'rigs'>[]) => {
      files.set(storeFilenameFor(owner), rows);
    },
    rowsFor: (owner: string) => files.get(storeFilenameFor(owner)),
  };
}

/** A `cacheEntryRemoved` that never resolves — the entry outlives the test. */
function neverRemoved(): Promise<void> {
  return new Promise<void>(() => {
    // Deliberately never settles.
  });
}

/** Let every already-queued microtask settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** Collect everything a watch over `rigsQuery` emits through `open`. */
function watchRigs(open: () => Promise<LocalDatabase | undefined>): Rig[][] {
  const emissions: Rig[][] = [];
  void watchIntoCache({
    query: rigsQuery,
    emit: (value) => {
      emissions.push(value);
    },
    removed: neverRemoved(),
    open,
  });
  return emissions;
}

describe('local store ownership', () => {
  it('serves the next owner nothing of the previous owner after a sign-out', async () => {
    const disk = originStorage();
    disk.seed(OWNER_A, [
      rigRow(OWNER_A, 'Rig One'),
      rigRow(OWNER_A, 'Rig Two'),
    ]);
    disk.seed(OWNER_B, [rigRow(OWNER_B, 'Other Rig')]);

    let signedIn: string | undefined = OWNER_A;
    const forgetOwner = jest.fn();
    const session = createLocalStoreSession({
      resolveOwner: () => Promise.resolve(signedIn),
      openStore: disk.openStore,
      forgetOwner,
    });

    const forA = watchRigs(() => session.open());
    await settle();
    expect(forA.at(-1)?.map((rig) => rig.nickname)).toEqual([
      'Rig One',
      'Rig Two',
    ]);

    // Sign out: the rows go, not just the subscriptions.
    await session.reset({ clear: true });
    expect(disk.rowsFor(OWNER_A)).toBeUndefined();
    expect(forgetOwner).toHaveBeenCalled();

    // The next owner signs in on the same browser, in the same page.
    signedIn = OWNER_B;
    const forB = watchRigs(() => session.open());
    await settle();

    expect(forB).not.toHaveLength(0);
    for (const emission of forB) {
      expect(emission.map((rig) => rig.ownerId)).toEqual([OWNER_B]);
    }
  });

  it('never adopts the previous owner’s store when sign-out did not run', async () => {
    const disk = originStorage();
    disk.seed(OWNER_A, [rigRow(OWNER_A, 'Rig One')]);
    disk.seed(OWNER_B, [rigRow(OWNER_B, 'Other Rig')]);

    // Owner A used this browser and closed the tab without signing out; their
    // store is still on disk, still reporting a completed first sync.
    const session = createLocalStoreSession({
      resolveOwner: () => Promise.resolve<string | undefined>(OWNER_B),
      openStore: disk.openStore,
      forgetOwner: jest.fn(),
    });

    const emissions = watchRigs(() => session.open());
    await settle();

    expect(disk.opened).toEqual([storeFilenameFor(OWNER_B)]);
    expect(emissions).toEqual([
      [expect.objectContaining({ ownerId: OWNER_B, nickname: 'Other Rig' })],
    ]);
    expect(disk.rowsFor(OWNER_A)).toHaveLength(1);
  });

  it('drops the previous owner’s store the moment the signed-in owner changes', async () => {
    const disk = originStorage();
    disk.seed(OWNER_A, [rigRow(OWNER_A, 'Rig One')]);
    disk.seed(OWNER_B, [rigRow(OWNER_B, 'Other Rig')]);

    let signedIn: string | undefined = OWNER_A;
    const session = createLocalStoreSession({
      resolveOwner: () => Promise.resolve(signedIn),
      openStore: disk.openStore,
      forgetOwner: jest.fn(),
    });

    await expect(session.open()).resolves.toBeDefined();

    // A sign-in the page did not route through sign-out — a session that
    // expired in the tab, then a different person signing in.
    signedIn = OWNER_B;
    await session.reset({ clear: false });
    const second = await session.open();

    expect(disk.opened).toEqual([
      storeFilenameFor(OWNER_A),
      storeFilenameFor(OWNER_B),
    ]);
    // Closed, not cleared: owner A did not sign out, so their rows stand.
    expect(disk.rowsFor(OWNER_A)).toHaveLength(1);
    await expect(second?.store.getAll('select 1')).resolves.toEqual([
      expect.objectContaining({ owner_id: OWNER_B }),
    ]);
  });

  it('hands out no store, and releases any open one, when nobody is signed in', async () => {
    const disk = originStorage();
    disk.seed(OWNER_A, [rigRow(OWNER_A, 'Rig One')]);

    let signedIn: string | undefined = OWNER_A;
    const session = createLocalStoreSession({
      resolveOwner: () => Promise.resolve(signedIn),
      openStore: disk.openStore,
      forgetOwner: jest.fn(),
    });
    await session.open();

    signedIn = undefined;
    await session.reset({ clear: false });

    await expect(session.open()).resolves.toBeUndefined();
    expect(disk.disposals()).toBe(1);
  });

  it('opens the store once per owner however many entries subscribe', async () => {
    const disk = originStorage();
    disk.seed(OWNER_A, []);
    const resolveOwner = jest.fn(() =>
      Promise.resolve<string | undefined>(OWNER_A),
    );
    const session = createLocalStoreSession({
      resolveOwner,
      openStore: disk.openStore,
      forgetOwner: jest.fn(),
    });

    await Promise.all([session.open(), session.open(), session.open()]);

    expect(disk.opened).toEqual([storeFilenameFor(OWNER_A)]);
    expect(resolveOwner).toHaveBeenCalledTimes(1);
  });

  it('does not memoise a failed open, so a later subscription retries', async () => {
    let attempts = 0;
    const session = createLocalStoreSession({
      resolveOwner: () => Promise.resolve<string | undefined>(OWNER_A),
      openStore: () => {
        attempts += 1;
        if (attempts === 1) {
          return Promise.reject(new Error('Failed to construct Worker'));
        }
        return Promise.resolve<LocalDatabase>({
          store: { getAll: () => Promise.resolve([]) },
          waitForFirstSync: () => Promise.resolve(),
          onChange: () => noDispose,
          clear: () => Promise.resolve(),
          close: () => Promise.resolve(),
        });
      },
      forgetOwner: jest.fn(),
    });

    await expect(session.open()).rejects.toThrow('Failed to construct Worker');
    await expect(session.open()).resolves.toBeDefined();
    expect(attempts).toBe(2);
  });
});

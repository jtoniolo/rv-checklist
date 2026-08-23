import type { Rig } from '@rv-checklist/domain';
import type { LocalDatabase } from './local-store.js';
import {
  forgetStoreOwner,
  resolveStoreOwner,
  storeFilenameFor,
} from './owner.js';
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
    const forgetOwner = jest.fn();
    const session = createLocalStoreSession({
      resolveOwner: () => Promise.resolve(signedIn),
      openStore: disk.openStore,
      forgetOwner,
    });

    await expect(session.open()).resolves.toBeDefined();

    // A sign-in the page did not route through sign-out — a session that
    // expired in the tab, then a different person signing in.
    signedIn = OWNER_B;
    await session.reset({ clear: false });

    // Forgotten even though nothing was cleared: the remembered owner is the
    // offline fallback, and owner A is now the wrong answer for it.
    expect(forgetOwner).toHaveBeenCalled();
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

  it('forgets the remembered owner on a sign-out too', async () => {
    const forgetOwner = jest.fn();
    const session = createLocalStoreSession({
      resolveOwner: () => Promise.resolve<string | undefined>(OWNER_A),
      openStore: originStorage().openStore,
      forgetOwner,
    });

    await session.reset({ clear: true });

    expect(forgetOwner).toHaveBeenCalled();
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

/** The key `owner.ts` remembers the last synced owner under. */
const OWNER_KEY = 'rv.sync-owner';

/** An unsigned JWT-shaped token carrying `sub`. Only the payload is read. */
function tokenFor(sub: string): string {
  const payload = Buffer.from(JSON.stringify({ sub }))
    .toString('base64')
    .replaceAll('=', '')
    .replaceAll('+', '-')
    .replaceAll('/', '_');
  return `header.${payload}.signature`;
}

function tokenResponse(sub: string): Response {
  return Response.json({
    token: tokenFor(sub),
    endpoint: 'https://sync.example',
  });
}

/** A localStorage stand-in — the lib's specs run under `testEnvironment: node`. */
function installStorage(): Map<string, string> {
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null, // eslint-disable-line unicorn/no-null
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    },
  });
  return entries;
}

/**
 * A user switch that meets a dead network (ADR-0029, decision 10, rule 3).
 *
 * The rest of this file fakes `resolveOwner`; this block cannot, because the
 * bug it guards against lived entirely in the seam between the session and
 * `owner.ts` — each was defensible alone. Owner A synced on this browser, so
 * their id sits in `localStorage` and their store sits on disk. Owner B signs
 * in, which reaches the session as `reset({ clear: false })` and nothing else,
 * and B's first token request then fails at the transport level: one blocked
 * cross-origin request, a captive portal, an API blip. Falling back to the
 * remembered owner there opened A's store for B — emitting A's rows into B's
 * cache, where by decision 4 they outlived B's own correct network response —
 * and connected A's file with B's token, so B's rows replicated into it.
 *
 * So the real `resolveStoreOwner` and `forgetStoreOwner` run here, over a
 * stubbed `fetch` and `localStorage`. What is still approximated is wa-sqlite
 * and the replication itself: the fake disk shows which *file* was opened, not
 * what a real connect would have written into it. The token-side half of that
 * (a connector refusing a token that is not its owner's) is `connector.spec.ts`.
 */
describe('a user switch with no network', () => {
  let fetchSpy: jest.SpyInstance<
    ReturnType<typeof fetch>,
    Parameters<typeof fetch>
  >;
  let entries: Map<string, string>;
  let disk: ReturnType<typeof originStorage>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    entries = installStorage();
    disk = originStorage();
    disk.seed(OWNER_A, [rigRow(OWNER_A, 'Alice Rig')]);
    disk.seed(OWNER_B, [rigRow(OWNER_B, 'Bob Rig')]);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  /** A session wired to the real owner resolution, over the fake disk. */
  function realOwnerSession() {
    return createLocalStoreSession({
      resolveOwner: resolveStoreOwner,
      openStore: disk.openStore,
      forgetOwner: forgetStoreOwner,
    });
  }

  it('opens no store for the new owner when their first token request never lands', async () => {
    const session = realOwnerSession();

    // Owner A is signed in and reading their own store.
    fetchSpy.mockResolvedValue(tokenResponse(OWNER_A));
    const forA = watchRigs(() => session.open());
    await settle();
    expect(forA.at(-1)?.map((rig) => rig.nickname)).toEqual(['Alice Rig']);
    expect(entries.get(OWNER_KEY)).toBe(OWNER_A);

    // Owner B signs in: `loginWithGoogle` resets without clearing, because A
    // never signed out and B's store is a different file anyway.
    await session.reset({ clear: false });
    expect(entries.has(OWNER_KEY)).toBe(false);

    // B's first token request dies in transport.
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
    const forB = watchRigs(() => session.open());
    await settle();

    expect(forB).toEqual([]);
    await expect(session.open()).resolves.toBeUndefined();
    // A's file was opened once, before the switch, and never again.
    expect(disk.opened).toEqual([storeFilenameFor(OWNER_A)]);
    // Nothing was cleared: A did not sign out, so A's rows stand for A.
    expect(disk.rowsFor(OWNER_A)).toHaveLength(1);
  });

  it('opens the new owner’s own store as soon as a token does land', async () => {
    const session = realOwnerSession();

    fetchSpy.mockResolvedValue(tokenResponse(OWNER_A));
    await session.open();
    await session.reset({ clear: false });

    fetchSpy.mockResolvedValue(tokenResponse(OWNER_B));
    const forB = watchRigs(() => session.open());
    await settle();

    expect(disk.opened).toEqual([
      storeFilenameFor(OWNER_A),
      storeFilenameFor(OWNER_B),
    ]);
    expect(forB).toEqual([
      [expect.objectContaining({ ownerId: OWNER_B, nickname: 'Bob Rig' })],
    ]);
    expect(entries.get(OWNER_KEY)).toBe(OWNER_B);
  });

  it('still reads the signed-in owner’s own store offline', async () => {
    // The fallback exists for this: A reloads off grid, resolves nothing from
    // the server, and reads what they synced. Nobody else signed in since.
    fetchSpy.mockResolvedValue(tokenResponse(OWNER_A));
    await realOwnerSession().open();

    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
    const offline = realOwnerSession();
    const emissions = watchRigs(() => offline.open());
    await settle();

    expect(emissions).toEqual([
      [expect.objectContaining({ ownerId: OWNER_A, nickname: 'Alice Rig' })],
    ]);
  });
});

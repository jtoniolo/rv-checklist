import {
  forgetStoreOwner,
  resolveStoreOwner,
  storeFilenameFor,
} from './owner.js';

/**
 * Resolving whose local store may be opened (ADR-0029, decision 10). The rule
 * that matters for owner isolation is the negative one: an answer the server
 * *did* give, that is not a readable token, must resolve to "no store" rather
 * than to whoever this browser last synced as. A stale remembered owner is
 * exactly the value that would open a previous owner's store.
 */

const OWNER_A = '550e8400-e29b-41d4-a716-446655441111';
const OWNER_B = '550e8400-e29b-41d4-a716-446655442222';

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

describe('resolveStoreOwner', () => {
  let fetchSpy: jest.SpyInstance<
    ReturnType<typeof fetch>,
    Parameters<typeof fetch>
  >;
  let entries: Map<string, string>;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
    entries = installStorage();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('reads the owner from the sync token’s subject and remembers it', async () => {
    fetchSpy.mockResolvedValue(tokenResponse(OWNER_A));

    await expect(resolveStoreOwner()).resolves.toBe(OWNER_A);
    expect(entries.get(OWNER_KEY)).toBe(OWNER_A);
  });

  it('resolves to no owner on 401, and forgets the last one', async () => {
    fetchSpy.mockResolvedValue(tokenResponse(OWNER_A));
    await resolveStoreOwner();

    fetchSpy.mockResolvedValue(new Response(undefined, { status: 401 }));

    await expect(resolveStoreOwner()).resolves.toBeUndefined();
    expect(entries.has(OWNER_KEY)).toBe(false);
  });

  it('falls back to the remembered owner only when the network is gone', async () => {
    fetchSpy.mockResolvedValue(tokenResponse(OWNER_A));
    await resolveStoreOwner();

    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

    // Offline: the device can only be showing the owner it last synced as, and
    // reading their persisted store is the whole point of the offline path.
    await expect(resolveStoreOwner()).resolves.toBe(OWNER_A);
  });

  it.each([
    ['a server error', new Response('boom', { status: 500 })],
    [
      'a middleware redirect to an HTML page',
      new Response('<!doctype html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      }),
    ],
    [
      'a body with no token',
      new Response('{}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ],
  ])('resolves to no owner on %s', async (_case, response) => {
    fetchSpy.mockResolvedValue(tokenResponse(OWNER_A));
    await resolveStoreOwner();

    fetchSpy.mockResolvedValue(response);

    // The server was reachable, so a remembered owner that disagrees with it
    // is the stale value that would open the previous owner's store.
    await expect(resolveStoreOwner()).resolves.toBeUndefined();
  });

  it('follows the token when it names a different owner than the remembered one', async () => {
    fetchSpy.mockResolvedValue(tokenResponse(OWNER_A));
    await resolveStoreOwner();

    fetchSpy.mockResolvedValue(tokenResponse(OWNER_B));

    await expect(resolveStoreOwner()).resolves.toBe(OWNER_B);
  });

  it('resolves to no owner with no browser storage — the server render', async () => {
    Reflect.deleteProperty(globalThis, 'localStorage');
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(resolveStoreOwner()).resolves.toBeUndefined();
    expect(() => {
      forgetStoreOwner();
    }).not.toThrow();
  });
});

describe('storeFilenameFor', () => {
  it('gives each owner their own file', () => {
    expect(storeFilenameFor(OWNER_A)).not.toBe(storeFilenameFor(OWNER_B));
  });

  it('keeps a hostile owner id out of the filename', () => {
    expect(storeFilenameFor('../../etc/passwd')).toBe(
      'rv-checklist-______etc_passwd.sqlite',
    );
  });
});

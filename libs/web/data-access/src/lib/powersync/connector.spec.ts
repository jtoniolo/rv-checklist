import type { CrudEntry, CrudTransaction } from '@powersync/web';
import { RvSyncConnector, type UploadDatabase } from './connector.js';

/** A `getAll`/`getNextCrudTransaction` stand-in with nothing queued. */
function emptyDatabase(): UploadDatabase {
  return {
    getAll: () => Promise.resolve([]),
    // eslint-disable-next-line unicorn/no-null
    getNextCrudTransaction: () => Promise.resolve(null),
  };
}

const rigId = '550e8400-e29b-41d4-a716-446655440010';

/** A `CrudEntry`-shaped fake — only the fields the connector reads matter. */
function crudEntry(overrides: Record<string, unknown>): CrudEntry {
  return {
    clientId: 7,
    id: rigId,
    op: 'PATCH',
    opData: { nickname: 'x' },
    previousValues: undefined,
    table: 'rigs',
    transactionId: 1,
    metadata: undefined,
    toJSON: () => ({}),
    equals: () => false,
    toComparisonArray: () => [],
    ...overrides,
  } as unknown as CrudEntry;
}

/** A localStorage stand-in so `syncDeviceId` mints a stable id. */
function installStorage(): void {
  const entries = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null, // eslint-disable-line unicorn/no-null
      setItem: (key: string, value: string) => entries.set(key, value),
      removeItem: (key: string) => entries.delete(key),
    },
  });
}

/** A one-transaction queue whose `complete()` is a spy. */
function queuedDatabase(entries: readonly CrudEntry[]): {
  database: UploadDatabase;
  complete: jest.Mock;
} {
  const complete = jest.fn().mockResolvedValue(undefined);
  let isDelivered = false;
  const transaction: CrudTransaction = {
    crud: [...entries],
    complete,
    haveMore: false,
    transactionId: 1,
  };
  return {
    database: {
      getAll: <Row>() =>
        Promise.resolve([
          { id: rigId, owner_id: 'owner-1', nickname: 'Silver Bullet' } as Row,
        ]),
      getNextCrudTransaction: () => {
        if (isDelivered) return Promise.resolve(null); // eslint-disable-line unicorn/no-null
        isDelivered = true;
        return Promise.resolve(transaction);
      },
    },
    complete,
  };
}

/**
 * How the sync engine gets its credentials, and the one case where it must not
 * get them (ADR-0029, decision 10).
 *
 * A connector belongs to the store it was opened over. Replication writes into
 * that file, so a token minted for anyone else must be refused rather than
 * used: the page memoises who is signed in and the cookies can change under it
 * — a sign-in in a second tab, or a session that was replaced while this tab
 * sat idle — and the token is the last place that disagreement is visible.
 * Connecting anyway put one owner's rows into another owner's file, and the
 * owner-scoped filename then stopped describing its contents.
 */

const OWNER_A = '550e8400-e29b-41d4-a716-446655441111';
const OWNER_B = '550e8400-e29b-41d4-a716-446655442222';

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

describe('RvSyncConnector', () => {
  let fetchSpy: jest.SpyInstance<
    ReturnType<typeof fetch>,
    Parameters<typeof fetch>
  >;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('hands the engine the token minted for its own store’s owner', async () => {
    fetchSpy.mockResolvedValue(tokenResponse(OWNER_A));

    await expect(
      new RvSyncConnector(OWNER_A).fetchCredentials(),
    ).resolves.toEqual({
      token: tokenFor(OWNER_A),
      endpoint: 'https://sync.example',
    });
  });

  it('refuses a token minted for anyone else', async () => {
    // Owner B signed in elsewhere while this store — owner A's file — was open.
    fetchSpy.mockResolvedValue(tokenResponse(OWNER_B));

    await expect(
      new RvSyncConnector(OWNER_A).fetchCredentials(),
    ).resolves.toBeNull();
  });

  it('refuses a token whose subject cannot be read at all', async () => {
    fetchSpy.mockResolvedValue(
      Response.json({ token: 'not-a-jwt', endpoint: 'https://sync.example' }),
    );

    await expect(
      new RvSyncConnector(OWNER_A).fetchCredentials(),
    ).resolves.toBeNull();
  });

  it('stops rather than retries when the session is gone', async () => {
    fetchSpy.mockResolvedValue(new Response(undefined, { status: 401 }));

    await expect(
      new RvSyncConnector(OWNER_A).fetchCredentials(),
    ).resolves.toBeNull();
  });

  it('throws on anything else, so the SDK backs off and retries', async () => {
    fetchSpy.mockResolvedValue(new Response('boom', { status: 503 }));

    await expect(
      new RvSyncConnector(OWNER_A).fetchCredentials(),
    ).rejects.toThrow('503');
  });

  it('returns from uploadData rather than throwing when the queue is empty', async () => {
    // A throw is how a connector reports a failed upload, and the SDK answers
    // it with an uncapped retry loop. An empty queue is not a failure.
    await expect(
      new RvSyncConnector(OWNER_A).uploadData(emptyDatabase()),
    ).resolves.toBeUndefined();
  });

  describe('uploadData — replaying a queued transaction', () => {
    beforeEach(installStorage);
    afterEach(() => Reflect.deleteProperty(globalThis, 'localStorage'));

    it('replays an entry and completes the transaction once every entry lands', async () => {
      fetchSpy.mockResolvedValue(new Response(undefined, { status: 200 }));
      const { database, complete } = queuedDatabase([crudEntry({})]);

      await new RvSyncConnector(OWNER_A).uploadData(database);

      expect(complete).toHaveBeenCalledTimes(1);
      const call = fetchSpy.mock.calls[0];
      expect(call).toBeDefined();
      const [, init] = call ?? [];
      const headers = new Headers(init?.headers);
      expect(headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}:7$/);
    });

    it('treats a fatal status (the row is already gone) as done, not a failure', async () => {
      fetchSpy.mockResolvedValue(new Response(undefined, { status: 404 }));
      const { database, complete } = queuedDatabase([crudEntry({})]);

      await new RvSyncConnector(OWNER_A).uploadData(database);

      expect(complete).toHaveBeenCalledTimes(1);
    });

    it('throws without completing on a retryable failure, so the SDK backs off', async () => {
      fetchSpy.mockResolvedValue(new Response('boom', { status: 503 }));
      const { database, complete } = queuedDatabase([crudEntry({})]);

      await expect(
        new RvSyncConnector(OWNER_A).uploadData(database),
      ).rejects.toThrow('503');
      expect(complete).not.toHaveBeenCalled();
    });
  });
});

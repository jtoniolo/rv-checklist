import { RvSyncConnector } from './connector.js';

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

  it('returns from uploadData rather than throwing', async () => {
    // A throw is how a connector reports a failed upload, and the SDK answers
    // it with an uncapped retry loop. Nothing is written locally yet (#147).
    await expect(
      new RvSyncConnector(OWNER_A).uploadData(),
    ).resolves.toBeUndefined();
  });
});

/* eslint-disable unicorn/no-null, @typescript-eslint/no-non-null-assertion -- Test data simulates Postgres nullable columns */
import {
  OAuthGrantService,
  RefreshTokenReuseError,
  RevokedGrantError,
  UnknownRefreshTokenError,
} from './oauth-grant.service.js';

const GRANT_ID = '11111111-1111-1111-1111-111111111111';
const TOKEN_ID = '22222222-2222-2222-2222-222222222222';
const RAW_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.test-refresh-token';

function fakeDataSource(queryResults: Record<string, unknown[][]> = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  return {
    calls,
    ds: {
      query: jest.fn((sql: string, params?: unknown[]) => {
        calls.push({ sql, params: params ?? [] });
        for (const [pattern, results] of Object.entries(queryResults)) {
          if (sql.includes(pattern)) {
            return results.shift() ?? [];
          }
        }
        return [];
      }),
    } as unknown as import('typeorm').DataSource,
  };
}

describe('OAuthGrantService', () => {
  describe('hashToken', () => {
    it('returns a hex SHA-256 digest', () => {
      const svc = new OAuthGrantService(fakeDataSource().ds);
      const hash = svc.hashToken('hello');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic', () => {
      const svc = new OAuthGrantService(fakeDataSource().ds);
      expect(svc.hashToken('abc')).toBe(svc.hashToken('abc'));
    });
  });

  describe('createGrant', () => {
    it('inserts a row and returns the generated ID', async () => {
      const { ds, calls } = fakeDataSource({
        INSERT: [[{ id: GRANT_ID }]],
      });
      const svc = new OAuthGrantService(ds);

      const id = await svc.createGrant('user-1', 'client-1', 'mcp');

      expect(id).toBe(GRANT_ID);
      expect(calls[0]!.sql).toContain('mcp_oauth_grants');
      expect(calls[0]!.params).toEqual(['user-1', 'client-1', 'mcp']);
    });
  });

  describe('recordRefreshToken', () => {
    it('inserts a hashed token row', async () => {
      const { ds, calls } = fakeDataSource();
      const svc = new OAuthGrantService(ds);

      await svc.recordRefreshToken(GRANT_ID, RAW_TOKEN, 1);

      expect(calls[0]!.sql).toContain('mcp_oauth_refresh_tokens');
      expect(calls[0]!.params[0]).toBe(GRANT_ID);
      expect(calls[0]!.params[1]).toMatch(/^[0-9a-f]{64}$/);
      expect(calls[0]!.params[2]).toBe(1);
    });
  });

  describe('spendRefreshToken', () => {
    it('marks the token as spent and returns the grant info', async () => {
      const { ds } = fakeDataSource({
        'FROM "mcp_oauth_refresh_tokens"': [
          [
            {
              id: TOKEN_ID,
              grant_id: GRANT_ID,
              generation: 2,
              spent_at: null,
            },
          ],
        ],
        'FROM "mcp_oauth_grants"': [[{ id: GRANT_ID, revoked_at: null }]],
      });
      const svc = new OAuthGrantService(ds);

      const result = await svc.spendRefreshToken(RAW_TOKEN);

      expect(result).toEqual({ grantId: GRANT_ID, generation: 2 });
    });

    it('throws UnknownRefreshTokenError when the hash is not found', async () => {
      const { ds } = fakeDataSource({
        'FROM "mcp_oauth_refresh_tokens"': [[]],
      });
      const svc = new OAuthGrantService(ds);

      await expect(svc.spendRefreshToken(RAW_TOKEN)).rejects.toThrow(
        UnknownRefreshTokenError,
      );
    });

    it('throws RevokedGrantError when the grant is revoked', async () => {
      const { ds } = fakeDataSource({
        'FROM "mcp_oauth_refresh_tokens"': [
          [
            {
              id: TOKEN_ID,
              grant_id: GRANT_ID,
              generation: 1,
              spent_at: null,
            },
          ],
        ],
        'FROM "mcp_oauth_grants"': [[{ id: GRANT_ID, revoked_at: new Date() }]],
      });
      const svc = new OAuthGrantService(ds);

      await expect(svc.spendRefreshToken(RAW_TOKEN)).rejects.toThrow(
        RevokedGrantError,
      );
    });

    it('revokes the grant and throws RefreshTokenReuseError on reuse', async () => {
      const { ds, calls } = fakeDataSource({
        'FROM "mcp_oauth_refresh_tokens"': [
          [
            {
              id: TOKEN_ID,
              grant_id: GRANT_ID,
              generation: 1,
              spent_at: new Date(),
            },
          ],
        ],
        'FROM "mcp_oauth_grants"': [[{ id: GRANT_ID, revoked_at: null }]],
      });
      const svc = new OAuthGrantService(ds);

      await expect(svc.spendRefreshToken(RAW_TOKEN)).rejects.toThrow(
        RefreshTokenReuseError,
      );

      const revokeCalls = calls.filter((c) =>
        c.sql.includes('UPDATE "mcp_oauth_grants"'),
      );
      expect(revokeCalls).toHaveLength(1);
      expect(revokeCalls[0]!.params[0]).toBe(GRANT_ID);
    });
  });

  describe('listActiveByUser', () => {
    it('uses LEFT JOIN so orphaned grants appear with a fallback name', async () => {
      const { ds, calls } = fakeDataSource({
        'LEFT JOIN': [
          [
            {
              id: GRANT_ID,
              clientName: '(unknown app)',
              createdAt: '2024-01-01T00:00:00Z',
              lastUsedAt: null,
            },
          ],
        ],
      });
      const svc = new OAuthGrantService(ds);

      const rows = await svc.listActiveByUser('user@example.com');

      expect(rows).toHaveLength(1);
      expect(rows[0]!.clientName).toBe('(unknown app)');
      expect(calls[0]!.sql).toContain('LEFT JOIN');
      expect(calls[0]!.sql).toContain('COALESCE');
    });
  });

  describe('revokeGrant', () => {
    it('sets revoked_at on the grant', async () => {
      const { ds, calls } = fakeDataSource();
      const svc = new OAuthGrantService(ds);

      await svc.revokeGrant(GRANT_ID);

      expect(calls[0]!.sql).toContain('UPDATE "mcp_oauth_grants"');
      expect(calls[0]!.params[0]).toBe(GRANT_ID);
    });
  });
});

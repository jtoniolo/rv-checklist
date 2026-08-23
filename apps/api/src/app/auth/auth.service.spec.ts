import { UnauthorizedException } from '@nestjs/common';
import {
  RefreshTokenStore,
  UserStore,
  type CreateRefreshTokenInput,
  type RefreshTokenRecord,
  type UpsertUserInput,
  type UpsertUserResult,
  type UserRecord,
  type WebSessionRecord,
} from '@rv-checklist/api-data-access';
import { StarterContentSeeder } from '../seed/seed.service.js';
import { AuthService } from './auth.service.js';
import { Clock } from './clock.js';
import type { GoogleProfile } from './google-verifier.js';
import { TokenService } from './token.service.js';

/** A clock the test drives by hand. */
class FakeClock extends Clock {
  constructor(public current: Date) {
    super();
  }
  now(): Date {
    return this.current;
  }
}

/** In-memory user store, array-backed for straightforward, typed lookups. */
class FakeUserStore extends UserStore {
  private seq = 0;
  private readonly rows: UserRecord[] = [];

  findById(id: string): Promise<UserRecord | undefined> {
    return Promise.resolve(this.rows.find((u) => u.id === id));
  }

  findByEmail(email: string): Promise<UserRecord | undefined> {
    return Promise.resolve(this.rows.find((u) => u.email === email));
  }

  upsertByGoogleSub(input: UpsertUserInput): Promise<UpsertUserResult> {
    const existing = this.rows.find((u) => u.googleSub === input.googleSub);
    const record: UserRecord = {
      id: existing?.id ?? `user-${String(++this.seq)}`,
      ...input,
    };
    if (existing) {
      this.rows[this.rows.indexOf(existing)] = record;
    } else {
      this.rows.push(record);
    }
    return Promise.resolve({ user: record, created: existing === undefined });
  }

  get count(): number {
    return this.rows.length;
  }

  bySub(googleSub: string): UserRecord | undefined {
    return this.rows.find((u) => u.googleSub === googleSub);
  }
}

/** A stored token as the fake holds it — mutable, and carrying its hash. */
interface StoredToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | undefined;
  replacedById: string | undefined;
  sessionId: string | undefined;
  userAgent: string | undefined;
  lastUsedAt: Date | undefined;
}

/** In-memory refresh-token store, array-backed. Revocation timestamps come
 * from the fake clock so the reuse-interval tests stay deterministic. */
class FakeRefreshStore extends RefreshTokenStore {
  private seq = 0;
  private readonly rows: StoredToken[] = [];

  constructor(private readonly clock: Clock) {
    super();
  }

  create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord> {
    const record: StoredToken = {
      id: `rt-${String(++this.seq)}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: undefined,
      replacedById: undefined,
      sessionId: input.sessionId,
      userAgent: input.userAgent,
      lastUsedAt: undefined,
    };
    this.rows.push(record);
    return Promise.resolve({
      id: record.id,
      userId: record.userId,
      expiresAt: record.expiresAt,
      revokedAt: record.revokedAt,
      replacedById: record.replacedById,
      sessionId: record.sessionId,
    });
  }

  findByHash(tokenHash: string): Promise<RefreshTokenRecord | undefined> {
    const found = this.rows.find((t) => t.tokenHash === tokenHash);
    if (!found) return Promise.resolve(undefined);
    return Promise.resolve({
      id: found.id,
      userId: found.userId,
      expiresAt: found.expiresAt,
      revokedAt: found.revokedAt,
      replacedById: found.replacedById,
      sessionId: found.sessionId,
    });
  }

  findById(id: string): Promise<RefreshTokenRecord | undefined> {
    const found = this.rows.find((t) => t.id === id);
    if (!found) return Promise.resolve(undefined);
    return Promise.resolve({
      id: found.id,
      userId: found.userId,
      expiresAt: found.expiresAt,
      revokedAt: found.revokedAt,
      replacedById: found.replacedById,
      sessionId: found.sessionId,
    });
  }

  revoke(id: string, replacedById: string | undefined): Promise<void> {
    const found = this.rows.find((t) => t.id === id);
    if (found) {
      found.revokedAt = this.clock.now();
      found.replacedById = replacedById;
    }
    return Promise.resolve();
  }

  updateLastUsed(id: string): Promise<void> {
    const found = this.rows.find((t) => t.id === id);
    if (found) found.lastUsedAt = new Date();
    return Promise.resolve();
  }

  findActiveSessionsByUser(userId: string): Promise<WebSessionRecord[]> {
    const bySession = new Map<string, StoredToken[]>();
    for (const t of this.rows) {
      if (t.userId !== userId || !t.sessionId) continue;
      const arr = bySession.get(t.sessionId) ?? [];
      arr.push(t);
      bySession.set(t.sessionId, arr);
    }
    const sessions: WebSessionRecord[] = [];
    for (const [sessionId, tokens] of bySession) {
      const hasActive = tokens.some((t) => t.revokedAt === undefined);
      if (!hasActive) continue;
      const first = tokens[0];
      if (!first) continue;
      let earliest: StoredToken = first;
      let latest: StoredToken = first;
      for (const t of tokens) {
        if (t.expiresAt < earliest.expiresAt) earliest = t;
        const tTime = t.lastUsedAt ?? t.expiresAt;
        const lTime = latest.lastUsedAt ?? latest.expiresAt;
        if (tTime > lTime) latest = t;
      }
      sessions.push({
        sessionId,
        userAgent: earliest.userAgent,
        createdAt: earliest.expiresAt,
        lastUsedAt: latest.lastUsedAt,
      });
    }
    return Promise.resolve(sessions);
  }

  revokeBySessionId(sessionId: string): Promise<void> {
    for (const t of this.rows) {
      if (t.sessionId === sessionId && t.revokedAt === undefined) {
        t.revokedAt = this.clock.now();
      }
    }
    return Promise.resolve();
  }

  get count(): number {
    return this.rows.length;
  }

  sessionIdOf(tokenId: string): string | undefined {
    return this.rows.find((t) => t.id === tokenId)?.sessionId;
  }
}

/** Records who got seeded instead of dragging the domain stack into auth tests. */
class FakeSeeder extends StarterContentSeeder {
  readonly seededOwners: string[] = [];
  failWith: Error | undefined;

  seedStarterContent(ownerId: string): Promise<void> {
    if (this.failWith) {
      return Promise.reject(this.failWith);
    }
    this.seededOwners.push(ownerId);
    return Promise.resolve();
  }
}

/** A TokenService wired to a real JwtService/config stand-in — no Nest container. */
function buildTokenService(): TokenService {
  const jwt = {
    sign: (payload: object, opts: { subject: string; expiresIn: number }) =>
      `signed:${opts.subject}:${JSON.stringify(payload)}`,
  };
  const values: Record<string, number> = {
    JWT_ACCESS_TTL: 900,
    REFRESH_TTL_DAYS: 30,
    REFRESH_REUSE_INTERVAL_SECONDS: 120,
  };
  const config = {
    get: (key: string) => values[key],
  };
  return new TokenService(
    jwt as unknown as ConstructorParameters<typeof TokenService>[0],
    config as unknown as ConstructorParameters<typeof TokenService>[1],
  );
}

const profile: GoogleProfile = {
  sub: 'google-123',
  email: 'owner@example.com',
  emailVerified: true,
  name: 'Owner',
  picture: undefined,
};

function build(): {
  service: AuthService;
  users: FakeUserStore;
  refresh: FakeRefreshStore;
  clock: FakeClock;
  seeder: FakeSeeder;
} {
  const users = new FakeUserStore();
  const clock = new FakeClock(new Date('2026-07-19T00:00:00.000Z'));
  const refresh = new FakeRefreshStore(clock);
  const seeder = new FakeSeeder();
  const service = new AuthService(
    users,
    refresh,
    buildTokenService(),
    clock,
    seeder,
  );
  return { service, users, refresh, clock, seeder };
}

describe('AuthService.loginWithGoogle', () => {
  it('upserts the user and issues a token pair', async () => {
    const { service, users } = build();

    const { pair } = await service.loginWithGoogle(profile);

    expect(pair.accessToken).toContain('user-1');
    expect(pair.refreshToken).not.toBe('');
    expect(pair.expiresIn).toBe(900);
    expect(users.bySub('google-123')?.email).toBe('owner@example.com');
  });

  it('rejects an unverified Google email', async () => {
    const { service } = build();
    await expect(
      service.loginWithGoogle({ ...profile, emailVerified: false }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('reuses the same user id on a second sign-in (no duplicate owner)', async () => {
    const { service, users } = build();
    await service.loginWithGoogle(profile);
    await service.loginWithGoogle({ ...profile, name: 'Renamed' });
    expect(users.count).toBe(1);
    expect(users.bySub('google-123')?.name).toBe('Renamed');
  });

  it('seeds starter content for a brand-new owner (issue #19)', async () => {
    const { service, users, seeder } = build();

    await service.loginWithGoogle(profile);

    expect(seeder.seededOwners).toEqual([users.bySub('google-123')?.id]);
  });

  it('never re-seeds a returning owner', async () => {
    const { service, seeder } = build();

    await service.loginWithGoogle(profile);
    await service.loginWithGoogle(profile);

    expect(seeder.seededOwners).toHaveLength(1);
  });

  it('still signs the owner in when seeding fails (best-effort)', async () => {
    const { service, seeder } = build();
    seeder.failWith = new Error('database hiccup');

    const { pair } = await service.loginWithGoogle(profile);

    expect(pair.accessToken).toContain('user-1');
  });
});

describe('AuthService.refresh', () => {
  it('rotates: the old token is revoked and a new pair issued', async () => {
    const { service, refresh, clock } = build();
    const { pair: first } = await service.loginWithGoogle(profile);

    const { pair: second } = await service.refresh(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    clock.current = new Date(clock.current.getTime() + 121_000);
    await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(refresh.count).toBe(2);
    await expect(service.refresh(second.refreshToken)).resolves.toBeDefined();
  });

  it('rejects an unknown refresh token', async () => {
    const { service } = build();
    await expect(service.refresh('nonsense')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects an expired refresh token', async () => {
    const { service, clock } = build();
    const { pair: first } = await service.loginWithGoogle(profile);
    clock.current = new Date('2026-10-01T00:00:00.000Z');
    await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  describe('reuse interval (ADR-0028, #148)', () => {
    it('accepts a just-rotated token inside the window and issues a sibling pair', async () => {
      const { service, refresh, clock } = build();
      const { pair: first } = await service.loginWithGoogle(profile);
      await service.refresh(first.refreshToken);
      const sessionId = refresh.sessionIdOf('rt-1');

      clock.current = new Date(clock.current.getTime() + 60_000);
      const { pair: replayed } = await service.refresh(first.refreshToken);

      expect(replayed.refreshToken).not.toBe(first.refreshToken);
      expect(refresh.count).toBe(3);
      expect(refresh.sessionIdOf('rt-3')).toBe(sessionId);
      // No revocation cascade: both successors still refresh.
      await expect(
        service.refresh(replayed.refreshToken),
      ).resolves.toBeDefined();
    });

    it('rejects a rotated token after the window', async () => {
      const { service, clock } = build();
      const { pair: first } = await service.loginWithGoogle(profile);
      await service.refresh(first.refreshToken);

      clock.current = new Date(clock.current.getTime() + 121_000);
      await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('never resurrects a logged-out token, even inside the window', async () => {
      const { service, clock } = build();
      const { pair } = await service.loginWithGoogle(profile);
      await service.logout(pair.refreshToken);

      clock.current = new Date(clock.current.getTime() + 10_000);
      await expect(service.refresh(pair.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('never resurrects a session-revoked token, even inside the window', async () => {
      const { service, refresh, clock } = build();
      const { pair } = await service.loginWithGoogle(profile);
      const sessionId = refresh.sessionIdOf('rt-1');
      expect(sessionId).toBeDefined();
      await service.revokeSession(sessionId ?? '', 'user-1');

      clock.current = new Date(clock.current.getTime() + 10_000);
      await expect(service.refresh(pair.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an in-window replay after the session is revoked (revocation stays final)', async () => {
      const { service, refresh, clock } = build();
      const { pair: first } = await service.loginWithGoogle(profile);
      await service.refresh(first.refreshToken);
      const sessionId = refresh.sessionIdOf('rt-1');
      expect(sessionId).toBeDefined();
      await service.revokeSession(sessionId ?? '', 'user-1');

      clock.current = new Date(clock.current.getTime() + 10_000);
      await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an in-window replay after the successor is logged out (logout stays final)', async () => {
      const { service, clock } = build();
      const { pair: first } = await service.loginWithGoogle(profile);
      const { pair: second } = await service.refresh(first.refreshToken);
      await service.logout(second.refreshToken);

      clock.current = new Date(clock.current.getTime() + 10_000);
      await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('a rejected replay does not resurrect the revoked session in listSessions', async () => {
      const { service, refresh, clock } = build();
      const { pair: first } = await service.loginWithGoogle(profile);
      await service.refresh(first.refreshToken);
      const sessionId = refresh.sessionIdOf('rt-1');
      await service.revokeSession(sessionId ?? '', 'user-1');

      clock.current = new Date(clock.current.getTime() + 10_000);
      await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      await expect(service.listSessions('user-1')).resolves.toHaveLength(0);
    });

    it('rejects an in-window replay when a longer chain was session-revoked', async () => {
      const { service, refresh, clock } = build();
      const { pair: first } = await service.loginWithGoogle(profile);
      const { pair: second } = await service.refresh(first.refreshToken);
      await service.refresh(second.refreshToken);
      const sessionId = refresh.sessionIdOf('rt-1');
      await service.revokeSession(sessionId ?? '', 'user-1');

      clock.current = new Date(clock.current.getTime() + 10_000);
      await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('accepts a replay whose successor was itself rotated onward (chain still live)', async () => {
      const { service, clock } = build();
      const { pair: first } = await service.loginWithGoogle(profile);
      const { pair: second } = await service.refresh(first.refreshToken);
      await service.refresh(second.refreshToken);

      clock.current = new Date(clock.current.getTime() + 10_000);
      await expect(service.refresh(first.refreshToken)).resolves.toBeDefined();
    });

    it('an in-window replay does not slide the window open', async () => {
      const { service, clock } = build();
      const { pair: first } = await service.loginWithGoogle(profile);
      await service.refresh(first.refreshToken);

      clock.current = new Date(clock.current.getTime() + 100_000);
      await service.refresh(first.refreshToken);

      clock.current = new Date(clock.current.getTime() + 100_000);
      await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  it('propagates session_id from the old token to the new one (#98)', async () => {
    const { service, refresh } = build();
    const { pair: first } = await service.loginWithGoogle(profile);
    const firstSessionId = refresh.sessionIdOf('rt-1');

    await service.refresh(first.refreshToken);
    const secondSessionId = refresh.sessionIdOf('rt-2');

    expect(firstSessionId).toBeDefined();
    expect(secondSessionId).toBe(firstSessionId);
  });
});

describe('AuthService.logout', () => {
  it('revokes the presented token so it can no longer refresh', async () => {
    const { service } = build();
    const { pair } = await service.loginWithGoogle(profile);
    await service.logout(pair.refreshToken);
    await expect(service.refresh(pair.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('is a no-op for an unknown token', async () => {
    const { service } = build();
    await expect(service.logout('nope')).resolves.toBeUndefined();
  });
});

describe('AuthService session management (#98)', () => {
  it('loginWithGoogle creates a session_id on the refresh token', async () => {
    const { service, refresh } = build();
    await service.loginWithGoogle(profile);
    expect(refresh.sessionIdOf('rt-1')).toBeDefined();
  });

  it('listSessions returns active sessions', async () => {
    const { service } = build();
    await service.loginWithGoogle(profile, 'Firefox/100');
    const sessions = await service.listSessions('user-1');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.userAgent).toBe('Firefox/100');
  });

  it('revokeSession revokes every token in the chain', async () => {
    const { service } = build();
    const { pair: first } = await service.loginWithGoogle(profile);
    await service.refresh(first.refreshToken);
    const sessions = await service.listSessions('user-1');
    expect(sessions).toHaveLength(1);

    const wasRevoked = await service.revokeSession(
      sessions[0]?.sessionId ?? '',
      'user-1',
    );
    expect(wasRevoked).toBe(true);

    const after = await service.listSessions('user-1');
    expect(after).toHaveLength(0);
  });

  it('revokeSession returns false for a non-owned session', async () => {
    const { service } = build();
    await service.loginWithGoogle(profile);
    const wasRevoked = await service.revokeSession(
      '00000000-0000-0000-0000-000000000000',
      'user-1',
    );
    expect(wasRevoked).toBe(false);
  });

  it('two logins create two distinct sessions', async () => {
    const { service } = build();
    await service.loginWithGoogle(profile, 'Chrome/120');
    await service.loginWithGoogle(profile, 'Safari/17');
    const sessions = await service.listSessions('user-1');
    expect(sessions).toHaveLength(2);
  });
});

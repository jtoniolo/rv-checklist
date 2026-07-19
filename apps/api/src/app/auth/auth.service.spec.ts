import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { Clock } from './clock.js';
import type { GoogleProfile } from './google-verifier.js';
import { RefreshTokenStore, UserStore } from './stores.js';
import type {
  CreateRefreshTokenInput,
  RefreshTokenRecord,
  UpsertUserInput,
  UserRecord,
} from './stores.js';
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

  upsertByGoogleSub(input: UpsertUserInput): Promise<UserRecord> {
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
    return Promise.resolve(record);
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
}

/** In-memory refresh-token store, array-backed. */
class FakeRefreshStore extends RefreshTokenStore {
  private seq = 0;
  private readonly rows: StoredToken[] = [];

  create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord> {
    const record: StoredToken = {
      id: `rt-${String(++this.seq)}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      revokedAt: undefined,
    };
    this.rows.push(record);
    return Promise.resolve(record);
  }

  findByHash(tokenHash: string): Promise<RefreshTokenRecord | undefined> {
    return Promise.resolve(this.rows.find((t) => t.tokenHash === tokenHash));
  }

  revoke(id: string, replacedById: string | undefined): Promise<void> {
    void replacedById;
    const found = this.rows.find((t) => t.id === id);
    if (found) found.revokedAt = new Date();
    return Promise.resolve();
  }

  get count(): number {
    return this.rows.length;
  }
}

/** A TokenService wired to a real JwtService/config stand-in — no Nest container. */
function buildTokenService(): TokenService {
  const jwt = {
    sign: (payload: object, opts: { subject: string; expiresIn: number }) =>
      `signed:${opts.subject}:${JSON.stringify(payload)}`,
  };
  const config = {
    get: (key: string) => (key === 'JWT_ACCESS_TTL' ? 900 : 30),
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
} {
  const users = new FakeUserStore();
  const refresh = new FakeRefreshStore();
  const clock = new FakeClock(new Date('2026-07-19T00:00:00.000Z'));
  const service = new AuthService(users, refresh, buildTokenService(), clock);
  return { service, users, refresh, clock };
}

describe('AuthService.loginWithGoogle', () => {
  it('upserts the user and issues a token pair', async () => {
    const { service, users } = build();

    const pair = await service.loginWithGoogle(profile);

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
});

describe('AuthService.refresh', () => {
  it('rotates: the old token is revoked and a new pair issued', async () => {
    const { service, refresh } = build();
    const first = await service.loginWithGoogle(profile);

    const second = await service.refresh(first.refreshToken);

    expect(second.refreshToken).not.toBe(first.refreshToken);
    // The originally-issued token is now revoked and can't be reused.
    await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    // The new token works.
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
    const first = await service.loginWithGoogle(profile);
    // Jump past the refresh lifetime (30 days in the test config).
    clock.current = new Date('2026-10-01T00:00:00.000Z');
    await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('AuthService.logout', () => {
  it('revokes the presented token so it can no longer refresh', async () => {
    const { service } = build();
    const pair = await service.loginWithGoogle(profile);
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

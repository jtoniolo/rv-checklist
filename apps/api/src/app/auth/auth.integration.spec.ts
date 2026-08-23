import { type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
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
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { StarterContentSeeder } from '../seed/seed.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { Clock } from './clock.js';
import {
  GoogleIdTokenVerifier,
  type GoogleProfile,
} from './google-verifier.js';
import { MeController } from './me.controller.js';
import { GoogleIdTokenStrategy } from './strategies/google-id-token.strategy.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { TokenService } from './token.service.js';

// ---------------------------------------------------------------------------
// Fakes — same abstract-port pattern as the unit tests
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-secret-that-is-long-enough';
// Base64url charset, like the real POWERSYNC_JWT_SECRET contract (ADR-0028).
const POWERSYNC_JWT_SECRET = 'test-powersync-secret-in-base64url-chars-0000';
const POWERSYNC_URL = 'http://localhost:8080';

const CANNED_PROFILE: GoogleProfile = {
  sub: 'google-456',
  email: 'integration@example.com',
  emailVerified: true,
  name: 'Integration Tester',
  picture: undefined,
};

class FakeGoogleVerifier extends GoogleIdTokenVerifier {
  profile: GoogleProfile = CANNED_PROFILE;

  verify(_idToken: string): Promise<GoogleProfile> {
    return Promise.resolve(this.profile);
  }
}

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
}

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
        t.revokedAt = new Date();
      }
    }
    return Promise.resolve();
  }
}

/** Real time plus a test-driven offset, so tests can jump past the reuse window. */
class FakeClock extends Clock {
  offsetMs = 0;

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }
}

class FakeSeeder extends StarterContentSeeder {
  seedStarterContent(_ownerId: string): Promise<void> {
    return Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCookies(res: request.Response): Record<string, string> {
  const cookies: Record<string, string> = {};
  const header = res.headers['set-cookie'] as string[] | undefined;
  if (!header) return cookies;
  for (const raw of header) {
    const segment = raw.split(';', 1)[0] ?? '';
    const eqIdx = segment.indexOf('=');
    if (eqIdx === -1) continue;
    cookies[segment.slice(0, eqIdx)] = segment.slice(eqIdx + 1);
  }
  return cookies;
}

function assertHttpOnlyCookie(res: request.Response, cookieName: string): void {
  const header = res.headers['set-cookie'] as string[] | undefined;
  expect(header).toBeDefined();
  const prefix = cookieName + '=';
  const cookie = header?.find((c: string) => c.startsWith(prefix));
  expect(cookie).toBeDefined();
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=Lax/i);
}

function cookieHeader(cookies: Record<string, string>): string {
  const access = cookies['rv.access'] ?? '';
  const refresh = cookies['rv.refresh'] ?? '';
  return 'rv.access=' + access + '; rv.refresh=' + refresh;
}

function accessCookieHeader(cookies: Record<string, string>): string {
  return 'rv.access=' + (cookies['rv.access'] ?? '');
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(segment, 'base64url').toString('utf8'),
  ) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Auth HTTP integration (cookie transport, ADR-0019)', () => {
  let app: INestApplication;
  let server: App;
  let clock: FakeClock;

  beforeAll(async () => {
    clock = new FakeClock();
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET,
              POWERSYNC_JWT_SECRET,
              POWERSYNC_URL,
              JWT_ACCESS_TTL: 900,
              REFRESH_TTL_DAYS: 30,
              REFRESH_REUSE_INTERVAL_SECONDS: 120,
              GOOGLE_CLIENT_ID: 'fake-client-id',
              DATABASE_URL: 'postgres://unused',
              WEB_ORIGIN: 'http://localhost:4200',
            }),
          ],
        }),
        PassportModule,
        JwtModule.register({ secret: JWT_SECRET }),
      ],
      controllers: [AuthController, MeController],
      providers: [
        AuthService,
        TokenService,
        JwtStrategy,
        GoogleIdTokenStrategy,
        { provide: Clock, useValue: clock },
        { provide: GoogleIdTokenVerifier, useClass: FakeGoogleVerifier },
        { provide: UserStore, useClass: FakeUserStore },
        { provide: RefreshTokenStore, useValue: new FakeRefreshStore(clock) },
        { provide: StarterContentSeeder, useClass: FakeSeeder },
      ],
    }).compile();

    app = module.createNestApplication();
    app.use(cookieParser());
    await app.init();
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
  });

  async function signIn(): Promise<{
    cookies: Record<string, string>;
    res: request.Response;
  }> {
    const res = await request(server)
      .post('/auth/google')
      .send({ idToken: 'any-credential' })
      .expect(200);
    return { cookies: parseCookies(res), res };
  }

  // -- POST /auth/google ----------------------------------------------------

  describe('POST /auth/google', () => {
    it('sets httpOnly access and refresh cookies', async () => {
      const { cookies, res } = await signIn();

      expect(cookies['rv.access']).toBeDefined();
      expect(cookies['rv.refresh']).toBeDefined();
      assertHttpOnlyCookie(res, 'rv.access');
      assertHttpOnlyCookie(res, 'rv.refresh');
    });

    it('returns no token pair in the body', async () => {
      const { res } = await signIn();
      expect(res.body).toEqual({});
    });

    it('rejects a request with no body', async () => {
      await request(server).post('/auth/google').expect(401);
    });

    it('rejects a request with an empty idToken', async () => {
      await request(server)
        .post('/auth/google')
        .send({ idToken: '' })
        .expect(401);
    });
  });

  // -- POST /auth/refresh ---------------------------------------------------

  describe('POST /auth/refresh', () => {
    it('rotates the refresh cookie and sets a fresh access cookie', async () => {
      const { cookies: first } = await signIn();

      const refreshRes = await request(server)
        .post('/auth/refresh')
        .set('Cookie', cookieHeader(first))
        .expect(200);

      const second = parseCookies(refreshRes);
      expect(second['rv.access']).toBeDefined();
      expect(second['rv.refresh']).toBeDefined();
      expect(second['rv.refresh']).not.toBe(first['rv.refresh']);
      assertHttpOnlyCookie(refreshRes, 'rv.access');
      assertHttpOnlyCookie(refreshRes, 'rv.refresh');
    });

    it('accepts a just-spent refresh cookie inside the reuse interval (ADR-0028)', async () => {
      const { cookies: first } = await signIn();

      await request(server)
        .post('/auth/refresh')
        .set('Cookie', cookieHeader(first))
        .expect(200);

      const replayRes = await request(server)
        .post('/auth/refresh')
        .set('Cookie', cookieHeader(first))
        .expect(200);
      expect(parseCookies(replayRes)['rv.refresh']).toBeDefined();
    });

    it('rejects a spent refresh cookie after the reuse interval (rotation)', async () => {
      const { cookies: first } = await signIn();

      await request(server)
        .post('/auth/refresh')
        .set('Cookie', cookieHeader(first))
        .expect(200);

      clock.offsetMs = 3 * 60_000;
      try {
        await request(server)
          .post('/auth/refresh')
          .set('Cookie', cookieHeader(first))
          .expect(401);
      } finally {
        clock.offsetMs = 0;
      }
    });

    it('rejects a spent refresh cookie inside the reuse interval once the successor is logged out', async () => {
      const { cookies: first } = await signIn();

      const refreshRes = await request(server)
        .post('/auth/refresh')
        .set('Cookie', cookieHeader(first))
        .expect(200);
      const second = parseCookies(refreshRes);

      await request(server)
        .post('/auth/logout')
        .set('Cookie', cookieHeader(second))
        .expect(204);

      await request(server)
        .post('/auth/refresh')
        .set('Cookie', cookieHeader(first))
        .expect(401);
    });

    it('rejects a request with no refresh cookie', async () => {
      await request(server).post('/auth/refresh').expect(400);
    });
  });

  // -- POST /auth/logout ----------------------------------------------------

  describe('POST /auth/logout', () => {
    it('clears both cookies and revokes the refresh token', async () => {
      const { cookies } = await signIn();

      const logoutRes = await request(server)
        .post('/auth/logout')
        .set('Cookie', cookieHeader(cookies))
        .expect(204);

      const cleared = parseCookies(logoutRes);
      expect(cleared['rv.access']).toBe('');
      expect(cleared['rv.refresh']).toBe('');

      await request(server)
        .post('/auth/refresh')
        .set('Cookie', cookieHeader(cookies))
        .expect(401);
    });

    it('returns 204 even with no cookie (silent no-op)', async () => {
      await request(server).post('/auth/logout').expect(204);
    });
  });

  // -- GET /auth/powersync-token (ADR-0028) ---------------------------------

  describe('GET /auth/powersync-token', () => {
    it('mints a JWT the sync service accepts, plus the endpoint', async () => {
      const { cookies } = await signIn();

      const res = await request(server)
        .get('/auth/powersync-token')
        .set('Cookie', accessCookieHeader(cookies))
        .expect(200);

      const body = res.body as { token: string; endpoint: string };
      expect(body.endpoint).toBe(POWERSYNC_URL);

      const [header = '', payload = '', signature = ''] = body.token.split(
        '.',
        3,
      );
      // The service config pins kid `powersync` and audience `powersync`;
      // sub is the user id the sync rules read as token_parameters.user_id.
      expect(decodeSegment(header)).toMatchObject({
        alg: 'HS256',
        kid: 'powersync',
      });
      const claims = decodeSegment(payload);
      expect(claims['aud']).toBe('powersync');
      expect(claims['exp']).toBeDefined();
      expect(claims['iat']).toBeDefined();

      const me = await request(server)
        .get('/me')
        .set('Cookie', accessCookieHeader(cookies))
        .expect(200);
      expect(claims['sub']).toBe((me.body as { id: string }).id);

      // Verify the HS256 signature with the base64url-decoded shared key —
      // exactly what the sync service's inline JWKS (`kty: oct`) does.
      const { createHmac } = await import('node:crypto');
      const expected = createHmac(
        'sha256',
        Buffer.from(POWERSYNC_JWT_SECRET, 'base64url'),
      )
        .update(header + '.' + payload)
        .digest('base64url');
      expect(signature).toBe(expected);
    });

    it('rejects an unauthenticated request', async () => {
      await request(server).get('/auth/powersync-token').expect(401);
    });
  });

  // -- GET /me (guarded route) — cookie AND bearer -------------------------

  describe('GET /me', () => {
    it('authenticates via access cookie', async () => {
      const { cookies } = await signIn();

      const res = await request(server)
        .get('/me')
        .set('Cookie', accessCookieHeader(cookies))
        .expect(200);

      const owner = res.body as { id: string; email: string; name: string };
      expect(owner).toMatchObject({
        email: 'integration@example.com',
        name: 'Integration Tester',
      });
      expect(owner.id).toBeDefined();
    });

    it('authenticates via bearer token', async () => {
      const { cookies } = await signIn();
      const accessToken = cookies['rv.access'] ?? '';

      const res = await request(server)
        .get('/me')
        .set('Authorization', 'Bearer ' + accessToken)
        .expect(200);

      expect(res.body).toMatchObject({
        email: 'integration@example.com',
      });
    });

    it('rejects an unauthenticated request (no cookie, no bearer)', async () => {
      await request(server).get('/me').expect(401);
    });

    it('rejects an invalid bearer token', async () => {
      await request(server)
        .get('/me')
        .set('Authorization', 'Bearer garbage')
        .expect(401);
    });
  });
});

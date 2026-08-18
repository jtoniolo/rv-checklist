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
  sessionId: string | undefined;
  userAgent: string | undefined;
  lastUsedAt: Date | undefined;
}

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
      sessionId: found.sessionId,
    });
  }

  revoke(id: string, replacedById: string | undefined): Promise<void> {
    void replacedById;
    const found = this.rows.find((t) => t.id === id);
    if (found) found.revokedAt = new Date();
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

class FakeClock extends Clock {
  now(): Date {
    return new Date();
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Auth HTTP integration (cookie transport, ADR-0019)', () => {
  let app: INestApplication;
  let server: App;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET,
              JWT_ACCESS_TTL: 900,
              REFRESH_TTL_DAYS: 30,
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
        { provide: Clock, useClass: FakeClock },
        { provide: GoogleIdTokenVerifier, useClass: FakeGoogleVerifier },
        { provide: UserStore, useClass: FakeUserStore },
        { provide: RefreshTokenStore, useClass: FakeRefreshStore },
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

    it('rejects a spent refresh cookie (rotation)', async () => {
      const { cookies: first } = await signIn();

      await request(server)
        .post('/auth/refresh')
        .set('Cookie', cookieHeader(first))
        .expect(200);

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

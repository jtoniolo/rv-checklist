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
} from '@rv-checklist/api-data-access';
import type { TokenPair } from '@rv-checklist/domain';
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
// Test suite
// ---------------------------------------------------------------------------

describe('Auth HTTP integration', () => {
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
    await app.init();
    server = app.getHttpServer() as App;
  });

  afterAll(async () => {
    await app.close();
  });

  async function signIn(): Promise<TokenPair> {
    const res = await request(server)
      .post('/auth/google')
      .send({ idToken: 'any-credential' })
      .expect(200);
    return res.body as TokenPair;
  }

  // -- POST /auth/google ----------------------------------------------------

  describe('POST /auth/google', () => {
    it('returns a token pair with the body-token contract', async () => {
      const pair = await signIn();

      expect(pair.accessToken).toBeDefined();
      expect(typeof pair.accessToken).toBe('string');
      expect(pair.refreshToken).toBeDefined();
      expect(typeof pair.refreshToken).toBe('string');
      expect(pair.expiresIn).toBe(900);
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
    it('rotates the refresh token and returns a fresh pair', async () => {
      const first = await signIn();

      const res = await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);

      const second = res.body as TokenPair;
      expect(second.accessToken).toBeDefined();
      expect(second.refreshToken).toBeDefined();
      expect(second.refreshToken).not.toBe(first.refreshToken);
      expect(second.expiresIn).toBe(900);
    });

    it('rejects a spent refresh token (rotation)', async () => {
      const pair = await signIn();

      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: pair.refreshToken })
        .expect(200);

      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: pair.refreshToken })
        .expect(401);
    });

    it('rejects a missing refreshToken body', async () => {
      await request(server).post('/auth/refresh').send({}).expect(400);
    });

    it('rejects an unknown refresh token', async () => {
      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: 'bogus' })
        .expect(401);
    });
  });

  // -- POST /auth/logout ----------------------------------------------------

  describe('POST /auth/logout', () => {
    it('revokes the refresh token (204, no body)', async () => {
      const pair = await signIn();

      await request(server)
        .post('/auth/logout')
        .send({ refreshToken: pair.refreshToken })
        .expect(204);

      await request(server)
        .post('/auth/refresh')
        .send({ refreshToken: pair.refreshToken })
        .expect(401);
    });

    it('returns 204 for an unknown token (silent no-op)', async () => {
      await request(server)
        .post('/auth/logout')
        .send({ refreshToken: 'unknown' })
        .expect(204);
    });

    it('rejects a missing refreshToken body', async () => {
      await request(server).post('/auth/logout').send({}).expect(400);
    });
  });

  // -- GET /me (guarded route) ----------------------------------------------

  describe('GET /me', () => {
    it('returns the owner when a valid access token is presented', async () => {
      const pair = await signIn();

      const res = await request(server)
        .get('/me')
        .set('Authorization', `Bearer ${pair.accessToken}`)
        .expect(200);

      const owner = res.body as { id: string; email: string; name: string };
      expect(owner).toMatchObject({
        email: 'integration@example.com',
        name: 'Integration Tester',
      });
      expect(owner.id).toBeDefined();
    });

    it('rejects an unauthenticated request (no bearer)', async () => {
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

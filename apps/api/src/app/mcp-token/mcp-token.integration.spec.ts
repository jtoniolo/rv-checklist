import { type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import {
  McpTokenStore,
  UserStore,
  type McpTokenRecord,
  type UpsertUserInput,
  type UpsertUserResult,
  type UserRecord,
} from '@rv-checklist/api-data-access';
import request from 'supertest';
import type { App } from 'supertest/types';
import { JwtStrategy } from '../auth/strategies/jwt.strategy.js';
import { McpTokenController } from './mcp-token.controller.js';
import { McpTokenService } from './mcp-token.service.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const JWT_SECRET = 'test-secret-that-is-long-enough';
const USER_ID = 'user-mcp-test';
const USER_EMAIL = 'mcp@example.com';

interface StoredMcpToken {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  revokedAt: Date | undefined;
  lastUsedAt: Date | undefined;
}

interface McpTokenStatus {
  active: boolean;
  createdAt?: string;
  lastUsedAt?: string;
  token?: string;
  tokenHash?: string;
}

interface McpTokenCreated {
  token: string;
}

class FakeUserStore extends UserStore {
  private readonly users: UserRecord[] = [
    {
      id: USER_ID,
      googleSub: 'google-mcp',
      email: USER_EMAIL,
      name: 'MCP Tester',
      picture: undefined,
    },
  ];

  findById(id: string): Promise<UserRecord | undefined> {
    return Promise.resolve(this.users.find((u) => u.id === id));
  }

  findByEmail(email: string): Promise<UserRecord | undefined> {
    return Promise.resolve(this.users.find((u) => u.email === email));
  }

  upsertByGoogleSub(_input: UpsertUserInput): Promise<UpsertUserResult> {
    throw new Error('Not used in MCP token tests');
  }
}

class FakeMcpTokenStore extends McpTokenStore {
  private seq = 0;
  private readonly rows: StoredMcpToken[] = [];

  replaceForUser(userId: string, tokenHash: string): Promise<McpTokenRecord> {
    for (const row of this.rows) {
      if (row.userId === userId && row.revokedAt === undefined) {
        row.revokedAt = new Date();
      }
    }
    const record: StoredMcpToken = {
      id: `mcp-${String(++this.seq)}`,
      userId,
      tokenHash,
      createdAt: new Date(),
      revokedAt: undefined,
      lastUsedAt: undefined,
    };
    this.rows.push(record);
    return Promise.resolve(record);
  }

  findActiveByHash(tokenHash: string): Promise<McpTokenRecord | undefined> {
    return Promise.resolve(
      this.rows.find(
        (t) => t.tokenHash === tokenHash && t.revokedAt === undefined,
      ),
    );
  }

  findActiveByUser(userId: string): Promise<McpTokenRecord | undefined> {
    return Promise.resolve(
      this.rows.find((t) => t.userId === userId && t.revokedAt === undefined),
    );
  }

  revokeForUser(userId: string): Promise<void> {
    for (const row of this.rows) {
      if (row.userId === userId && row.revokedAt === undefined) {
        row.revokedAt = new Date();
      }
    }
    return Promise.resolve();
  }

  updateLastUsed(id: string): Promise<void> {
    const row = this.rows.find((t) => t.id === id);
    if (row) row.lastUsedAt = new Date();
    return Promise.resolve();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mintAccessToken(jwt: JwtService): string {
  return jwt.sign({ email: USER_EMAIL }, { subject: USER_ID });
}

const CONFIG_LOAD = [
  () => ({
    JWT_SECRET,
    JWT_ACCESS_TTL: 900,
    GOOGLE_CLIENT_ID: 'fake-client-id',
    DATABASE_URL: 'postgres://unused',
    WEB_ORIGIN: 'http://localhost:4200',
  }),
];

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('MCP token HTTP integration (ADR-0022)', () => {
  let app: INestApplication;
  let server: App;
  let accessToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: CONFIG_LOAD,
        }),
        PassportModule,
        JwtModule.register({ secret: JWT_SECRET }),
      ],
      controllers: [McpTokenController],
      providers: [
        McpTokenService,
        JwtStrategy,
        { provide: McpTokenStore, useClass: FakeMcpTokenStore },
        { provide: UserStore, useClass: FakeUserStore },
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
    server = app.getHttpServer() as App;

    const jwt = module.get(JwtService);
    accessToken = mintAccessToken(jwt);
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(req: request.Test): request.Test {
    return req.set('Authorization', 'Bearer ' + accessToken);
  }

  // -- Authentication required -----------------------------------------------

  describe('authentication', () => {
    it('rejects unauthenticated POST', async () => {
      await request(server).post('/mcp-token').expect(401);
    });

    it('rejects unauthenticated GET', async () => {
      await request(server).get('/mcp-token').expect(401);
    });

    it('rejects unauthenticated DELETE', async () => {
      await request(server).delete('/mcp-token').expect(401);
    });
  });

  // -- POST /mcp-token -------------------------------------------------------

  describe('POST /mcp-token', () => {
    it('returns a raw token with the rvmcp_ prefix', async () => {
      const res = await auth(request(server).post('/mcp-token')).expect(201);
      const body = res.body as McpTokenCreated;
      expect(body.token).toMatch(/^rvmcp_/);
    });

    it('replaces an existing token (only one active)', async () => {
      const first = await auth(request(server).post('/mcp-token')).expect(201);
      const second = await auth(request(server).post('/mcp-token')).expect(201);
      const firstBody = first.body as McpTokenCreated;
      const secondBody = second.body as McpTokenCreated;
      expect(secondBody.token).not.toBe(firstBody.token);

      const status = await auth(request(server).get('/mcp-token')).expect(200);
      const statusBody = status.body as McpTokenStatus;
      expect(statusBody.active).toBe(true);
    });
  });

  // -- GET /mcp-token --------------------------------------------------------

  describe('GET /mcp-token', () => {
    it('reports no active token when none exists', async () => {
      const freshModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: CONFIG_LOAD,
          }),
          PassportModule,
          JwtModule.register({ secret: JWT_SECRET }),
        ],
        controllers: [McpTokenController],
        providers: [
          McpTokenService,
          JwtStrategy,
          { provide: McpTokenStore, useClass: FakeMcpTokenStore },
          { provide: UserStore, useClass: FakeUserStore },
        ],
      }).compile();

      const freshApp = freshModule.createNestApplication();
      await freshApp.init();
      const freshServer = freshApp.getHttpServer() as App;

      const res = await request(freshServer)
        .get('/mcp-token')
        .set('Authorization', 'Bearer ' + accessToken)
        .expect(200);

      expect(res.body).toEqual({ active: false });
      await freshApp.close();
    });

    it('reports active token with createdAt after generation', async () => {
      await auth(request(server).post('/mcp-token')).expect(201);
      const res = await auth(request(server).get('/mcp-token')).expect(200);
      const body = res.body as McpTokenStatus;
      expect(body.active).toBe(true);
      expect(body.createdAt).toBeDefined();
      expect(body).not.toHaveProperty('token');
    });

    it('never exposes the raw token value', async () => {
      await auth(request(server).post('/mcp-token')).expect(201);
      const res = await auth(request(server).get('/mcp-token')).expect(200);
      const body = res.body as McpTokenStatus;
      expect(body.token).toBeUndefined();
      expect(body.tokenHash).toBeUndefined();
    });
  });

  // -- DELETE /mcp-token -----------------------------------------------------

  describe('DELETE /mcp-token', () => {
    it('revokes the active token', async () => {
      await auth(request(server).post('/mcp-token')).expect(201);
      await auth(request(server).delete('/mcp-token')).expect(204);

      const res = await auth(request(server).get('/mcp-token')).expect(200);
      const body = res.body as McpTokenStatus;
      expect(body.active).toBe(false);
    });

    it('is idempotent (no token to revoke)', async () => {
      await auth(request(server).delete('/mcp-token')).expect(204);
    });
  });
});

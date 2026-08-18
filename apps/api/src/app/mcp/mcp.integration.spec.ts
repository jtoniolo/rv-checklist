import { createHmac } from 'node:crypto';
import { Controller, type INestApplication, UseGuards } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  McpHttpControllerFor,
  McpStrategy,
  MCP_STRATEGY,
  StreamableHttpTransport,
} from '@rekog/mcp-nest';
import { JwtTokenService } from '@rekog/mcp-nest-auth';
import {
  ChecklistRepository,
  EquipmentItemRepository,
  LogEntryRepository,
  MaintenanceTaskRepository,
  McpTokenStore,
  RigRepository,
  RunRepository,
  UserStore,
  type McpTokenRecord,
  type UpsertUserInput,
  type UpsertUserResult,
  type UserRecord,
} from '@rv-checklist/api-data-access';
import {
  InMemoryChecklistRepository,
  InMemoryEquipmentItemRepository,
  InMemoryLogEntryRepository,
  InMemoryMaintenanceTaskRepository,
  InMemoryRigRepository,
  InMemoryRunRepository,
} from '@rv-checklist/domain/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Clock } from '../auth/clock.js';
import { McpAuthGuard } from '../auth/mcp-auth.guard.js';
import { TokenService } from '../auth/token.service.js';
import { ChecklistService } from '../checklist/checklist.service.js';
import { LogEntryService } from '../maintenance/log-entry.service.js';
import { MaintenanceTaskService } from '../maintenance/maintenance-task.service.js';
import { OAuthGrantService } from '../mcp-auth/oauth-grant.service.js';
import { RigService } from '../rig/rig.service.js';
import { RunService } from '../run/run.service.js';
import { McpToolsController } from './mcp-tools.controller.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID = 'user-mcp-int';
const USER_EMAIL = 'mcp-int@example.com';
const OTHER_USER_ID = 'user-other';

const MCP_JWT_SECRET = 'mcp-jwt-secret-for-integration-tests!!';
const SERVER_URL = 'http://localhost:3000';
const RESOURCE_URL = `${SERVER_URL}/api/mcp`;
const PRM_URL = `${SERVER_URL}/.well-known/oauth-protected-resource`;
const PROFILE_ID = 'oauth-profile-1';
const GRANT_ID = 'grant-int-1';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeUserStore extends UserStore {
  private readonly users: UserRecord[] = [
    {
      id: USER_ID,
      googleSub: 'google-mcp-int',
      email: USER_EMAIL,
      name: 'MCP Integration Tester',
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
    throw new Error('Not used in MCP integration tests');
  }
}

interface StoredMcpToken {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  revokedAt: Date | undefined;
  lastUsedAt: Date | undefined;
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

class FakeClock extends Clock {
  now(): Date {
    return new Date();
  }
}

class FakeOAuthStore {
  getUserProfileById(
    id: string,
  ): Promise<{ id: string; email?: string } | undefined> {
    if (id === PROFILE_ID) {
      return Promise.resolve({ id: PROFILE_ID, email: USER_EMAIL });
    }
    return Promise.resolve(undefined);
  }
}

class FakeOAuthGrantService {
  private readonly grants = new Map<string, boolean>([[GRANT_ID, true]]);
  readonly touchCalls: string[] = [];

  isGrantActive(grantId: string): Promise<boolean> {
    return Promise.resolve(this.grants.get(grantId) ?? false);
  }

  touchLastUsed(grantId: string): Promise<void> {
    this.touchCalls.push(grantId);
    return Promise.resolve();
  }

  revokeTestGrant(grantId: string): void {
    this.grants.set(grantId, false);
  }
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

function mintTestJwt(
  claims: Record<string, unknown> = {},
  secret = MCP_JWT_SECRET,
): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: PROFILE_ID,
      type: 'access',
      iss: SERVER_URL,
      aud: RESOURCE_URL,
      iat: now,
      exp: now + 3600,
      user_profile_id: PROFILE_ID,
      grant_id: GRANT_ID,
      scope: 'mcp',
      ...claims,
    }),
  ).toString('base64url');
  const sig = createHmac('sha256', secret)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${sig}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface ToolCallResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

function jsonrpc(method: string, params?: unknown, id = 1): JsonRpcRequest {
  return { jsonrpc: '2.0', id, method, params };
}

function parseToolText(body: JsonRpcResponse): unknown {
  const result = body.result as ToolCallResult;
  let text: unknown = JSON.parse(result.content[0]?.text ?? '{}');
  if (typeof text === 'string') {
    text = JSON.parse(text);
  }
  return text;
}

const CONFIG_LOAD = [
  () => ({
    JWT_SECRET: 'test-secret-that-is-long-enough',
    JWT_ACCESS_TTL: 900,
    GOOGLE_CLIENT_ID: 'fake-client-id',
    DATABASE_URL: 'postgres://unused',
    WEB_ORIGIN: 'http://localhost:4200',
  }),
];

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const RIG_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_RIG_ID = 'aaaaaaaa-0000-4000-8000-000000000099';
const CHECKLIST_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const RUN_ID = 'cccccccc-0000-4000-8000-000000000001';
const TASK_ID = 'dddddddd-0000-4000-8000-000000000001';
const LOG_ENTRY_ID = 'eeeeeeee-0000-4000-8000-000000000001';
const EQUIPMENT_ID = 'ffffffff-0000-4000-8000-000000000001';

void RUN_ID;
void CHECKLIST_ID;

async function seedData(repos: {
  rigs: InMemoryRigRepository;
  checklists: InMemoryChecklistRepository;
  runs: InMemoryRunRepository;
  tasks: InMemoryMaintenanceTaskRepository;
  logEntries: InMemoryLogEntryRepository;
  equipmentItems: InMemoryEquipmentItemRepository;
}): Promise<void> {
  await repos.rigs.save({
    id: RIG_ID,
    ownerId: USER_ID,
    nickname: 'Bigfoot',
    distanceKm: 45_000,
  });

  await repos.rigs.save({
    id: OTHER_RIG_ID,
    ownerId: OTHER_USER_ID,
    nickname: 'Not Yours',
    distanceKm: 10_000,
  });

  await repos.checklists.save({
    id: CHECKLIST_ID,
    rigId: RIG_ID,
    name: 'Pre-departure',
    tags: ['travel'],
    steps: [{ id: 'step-1', text: 'Close roof vents' }],
  });

  await repos.runs.save({
    id: RUN_ID,
    checklistId: CHECKLIST_ID,
    rigId: RIG_ID,
    startedOn: '2026-08-01',
    steps: [{ id: 'rs-1', text: 'Close roof vents', state: 'complete' }],
  });

  await repos.tasks.save({
    id: TASK_ID,
    rigId: RIG_ID,
    name: 'Condition slide seals',
    interval: { months: 6 },
    fieldSchema: [],
    tags: [],
  });

  await repos.logEntries.save({
    id: LOG_ENTRY_ID,
    taskId: TASK_ID,
    rigId: RIG_ID,
    taskName: 'Condition slide seals',
    performedOn: '2026-06-15',
    fields: [],
  });

  await repos.equipmentItems.save({
    id: EQUIPMENT_ID,
    rigId: RIG_ID,
    name: 'Surge protector',
    purchaseDate: '2025-03-15',
    costCents: 8999,
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('MCP endpoint integration (ADR-0021, ADR-0023, ADR-0024)', () => {
  let app: INestApplication;
  let server: App;
  let mcpToken: string;
  let jwtToken: string;
  let grantService: FakeOAuthGrantService;

  const transport = new StreamableHttpTransport({ responseMode: 'json' });
  const strategy = new McpStrategy({
    name: 'rv-checklist-test',
    version: '0.0.1',
    transports: [transport],
  });

  @Controller('mcp')
  @UseGuards(McpAuthGuard)
  class TestMcpHttpController extends McpHttpControllerFor(transport) {}

  const rigRepo = new InMemoryRigRepository();
  const checklistRepo = new InMemoryChecklistRepository();
  const runRepo = new InMemoryRunRepository();
  const taskRepo = new InMemoryMaintenanceTaskRepository();
  const logEntryRepo = new InMemoryLogEntryRepository();
  const equipmentItemRepo = new InMemoryEquipmentItemRepository();

  const OAUTH_OPTIONS = {
    jwtSecret: MCP_JWT_SECRET,
    serverUrl: SERVER_URL,
    resource: RESOURCE_URL,
    jwtAccessTokenExpiresIn: '1h',
    jwtRefreshTokenExpiresIn: '7d',
    enableRefreshTokens: false,
  };

  beforeAll(async () => {
    await seedData({
      rigs: rigRepo,
      checklists: checklistRepo,
      runs: runRepo,
      tasks: taskRepo,
      logEntries: logEntryRepo,
      equipmentItems: equipmentItemRepo,
    });

    grantService = new FakeOAuthGrantService();

    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: CONFIG_LOAD,
        }),
        JwtModule.register({
          secret: 'test-secret-that-is-long-enough',
        }),
      ],
      controllers: [TestMcpHttpController, McpToolsController],
      providers: [
        { provide: MCP_STRATEGY, useValue: strategy },
        { provide: UserStore, useClass: FakeUserStore },
        { provide: McpTokenStore, useClass: FakeMcpTokenStore },
        TokenService,
        { provide: Clock, useClass: FakeClock },
        RigService,
        ChecklistService,
        RunService,
        MaintenanceTaskService,
        LogEntryService,
        { provide: RigRepository, useValue: rigRepo },
        { provide: EquipmentItemRepository, useValue: equipmentItemRepo },
        { provide: ChecklistRepository, useValue: checklistRepo },
        { provide: RunRepository, useValue: runRepo },
        { provide: MaintenanceTaskRepository, useValue: taskRepo },
        { provide: LogEntryRepository, useValue: logEntryRepo },
        {
          provide: 'OAUTH_MODULE_OPTIONS',
          useValue: OAUTH_OPTIONS,
        },
        {
          provide: JwtTokenService,
          useFactory: () =>
            new JwtTokenService(
              OAUTH_OPTIONS as unknown as ConstructorParameters<
                typeof JwtTokenService
              >[0],
            ),
        },
        { provide: 'IOAuthStore', useClass: FakeOAuthStore },
        { provide: OAuthGrantService, useValue: grantService },
      ],
    }).compile();

    app = module.createNestApplication();
    app.use(cookieParser());

    strategy.setHttpAdapter(app.getHttpAdapter());
    app.connectMicroservice({ strategy });
    await app.startAllMicroservices();
    await app.init();

    server = app.getHttpServer() as App;

    const tokenStore = module.get(McpTokenStore);
    const tokenService = module.get(TokenService);
    const raw = 'rvmcp_testtoken1234567890abcdef';
    const hash = tokenService.hash(raw);
    await tokenStore.replaceForUser(USER_ID, hash);
    mcpToken = raw;

    jwtToken = mintTestJwt();
  });

  afterAll(async () => {
    await app.close();
  });

  function mcpPost(body: JsonRpcRequest): request.Test {
    return request(server)
      .post('/mcp')
      .set('Authorization', `Bearer ${mcpToken}`)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send(body);
  }

  function mcpPostJwt(body: JsonRpcRequest, token = jwtToken): request.Test {
    return request(server)
      .post('/mcp')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .set('Accept', 'application/json, text/event-stream')
      .send(body);
  }

  // -- Static-token authentication ------------------------------------------

  describe('static-token authentication', () => {
    it('rejects requests with an invalid rvmcp_ token (plain 401)', async () => {
      await request(server)
        .post('/mcp')
        .set('Authorization', 'Bearer rvmcp_bad')
        .set('Accept', 'application/json, text/event-stream')
        .send(
          jsonrpc('initialize', {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test', version: '1' },
          }),
        )
        .expect(401);
    });

    it('does not set WWW-Authenticate on invalid rvmcp_ token', async () => {
      const res = await request(server)
        .post('/mcp')
        .set('Authorization', 'Bearer rvmcp_bad')
        .set('Accept', 'application/json, text/event-stream')
        .send(
          jsonrpc('initialize', {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test', version: '1' },
          }),
        )
        .expect(401);
      expect(res.headers['www-authenticate']).toBeUndefined();
    });
  });

  // -- JWT authentication ---------------------------------------------------

  describe('JWT authentication', () => {
    it('rejects requests with no token (401 with WWW-Authenticate)', async () => {
      const res = await request(server)
        .post('/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .send(
          jsonrpc('initialize', {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test', version: '1' },
          }),
        )
        .expect(401);
      expect(res.headers['www-authenticate']).toBe(
        `Bearer resource_metadata="${PRM_URL}"`,
      );
    });

    it('rejects an invalid JWT with WWW-Authenticate', async () => {
      const res = await request(server)
        .post('/mcp')
        .set('Authorization', 'Bearer not.a.valid-jwt')
        .set('Accept', 'application/json, text/event-stream')
        .send(
          jsonrpc('initialize', {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'test', version: '1' },
          }),
        )
        .expect(401);
      expect(res.headers['www-authenticate']).toBe(
        `Bearer resource_metadata="${PRM_URL}"`,
      );
    });

    it('rejects a JWT signed with the wrong secret', async () => {
      const bad = mintTestJwt({}, 'wrong-secret-aaaaaaaa');
      const res = await mcpPostJwt(
        jsonrpc('initialize', {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        }),
        bad,
      ).expect(401);
      expect(res.headers['www-authenticate']).toBe(
        `Bearer resource_metadata="${PRM_URL}"`,
      );
    });

    it('rejects a JWT for the wrong audience (RFC 8707)', async () => {
      const bad = mintTestJwt({ aud: 'https://other-resource.example.com' });
      await mcpPostJwt(
        jsonrpc('initialize', {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        }),
        bad,
      ).expect(401);
    });

    it('rejects an expired JWT', async () => {
      const bad = mintTestJwt({
        exp: Math.floor(Date.now() / 1000) - 60,
        iat: Math.floor(Date.now() / 1000) - 3660,
      });
      await mcpPostJwt(
        jsonrpc('initialize', {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        }),
        bad,
      ).expect(401);
    });

    it('rejects a JWT whose grant has been revoked', async () => {
      const revokedGrantId = 'grant-revoked';
      const token = mintTestJwt({ grant_id: revokedGrantId });
      const res = await mcpPostJwt(
        jsonrpc('initialize', {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test', version: '1' },
        }),
        token,
      ).expect(401);
      expect(res.headers['www-authenticate']).toBe(
        `Bearer resource_metadata="${PRM_URL}"`,
      );
    });

    it('authenticates a valid JWT and resolves the same Owner shape', async () => {
      const res = await mcpPostJwt(
        jsonrpc('initialize', {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0' },
        }),
      ).expect(200);

      const body = res.body as JsonRpcResponse;
      expect(body.result).toBeDefined();
    });
  });

  // -- MCP protocol (static token) -----------------------------------------

  describe('MCP protocol', () => {
    it('handles initialize', async () => {
      const res = await mcpPost(
        jsonrpc('initialize', {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0' },
        }),
      ).expect(200);

      const body = res.body as JsonRpcResponse;
      expect(body.result).toBeDefined();
      const result = body.result as { serverInfo: { name: string } };
      expect(result.serverInfo.name).toBe('rv-checklist-test');
    });

    it('lists all fifteen tools', async () => {
      await mcpPost(
        jsonrpc('initialize', {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0' },
        }),
      ).expect(200);

      const res = await mcpPost(jsonrpc('tools/list', {}, 2)).expect(200);

      const body = res.body as JsonRpcResponse;
      const result = body.result as { tools: { name: string }[] };
      const names: string[] = result.tools.map((t) => t.name);
      names.sort((a, b) => a.localeCompare(b));
      expect(names).toEqual([
        'create_checklist',
        'create_maintenance_task',
        'delete_checklist',
        'delete_maintenance_task',
        'get_checklist',
        'get_maintenance_task',
        'get_rig',
        'get_run',
        'list_checklists',
        'list_log_entries',
        'list_maintenance_tasks',
        'list_rigs',
        'list_runs',
        'update_checklist',
        'update_maintenance_task',
      ]);
    });
  });

  // -- tools/call (static token) --------------------------------------------

  describe('tools/call (static token)', () => {
    beforeEach(async () => {
      await mcpPost(
        jsonrpc('initialize', {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0' },
        }),
      ).expect(200);
    });

    it("list_rigs returns the owner's rigs", async () => {
      const res = await mcpPost(
        jsonrpc('tools/call', { name: 'list_rigs', arguments: {} }, 10),
      ).expect(200);

      const rigs = parseToolText(res.body as JsonRpcResponse) as {
        id: string;
        nickname: string;
      }[];
      expect(rigs).toHaveLength(1);
      expect(rigs[0]).toMatchObject({ nickname: 'Bigfoot' });
    });

    it('get_rig returns a single rig with its equipment', async () => {
      const res = await mcpPost(
        jsonrpc(
          'tools/call',
          { name: 'get_rig', arguments: { id: RIG_ID } },
          11,
        ),
      ).expect(200);

      const rig = parseToolText(res.body as JsonRpcResponse) as {
        id: string;
        distanceKm: number;
        equipment: { id: string; name: string; costCents: number }[];
      };
      expect(rig.id).toBe(RIG_ID);
      expect(rig.distanceKm).toBe(45_000);
      expect(rig.equipment).toHaveLength(1);
      expect(rig.equipment[0]).toMatchObject({
        id: EQUIPMENT_ID,
        name: 'Surge protector',
        costCents: 8999,
      });
    });

    it('list_maintenance_tasks enriches with dueStatus', async () => {
      const res = await mcpPost(
        jsonrpc(
          'tools/call',
          { name: 'list_maintenance_tasks', arguments: { rigId: RIG_ID } },
          12,
        ),
      ).expect(200);

      const tasks = parseToolText(res.body as JsonRpcResponse) as {
        id: string;
        dueStatus: { kind: string };
      }[];
      expect(tasks).toHaveLength(1);
      expect(tasks[0]).toHaveProperty('dueStatus');
      expect(tasks[0]).toHaveProperty('dueStatus.kind');
    });

    it('get_maintenance_task enriches with dueStatus', async () => {
      const res = await mcpPost(
        jsonrpc(
          'tools/call',
          { name: 'get_maintenance_task', arguments: { id: TASK_ID } },
          13,
        ),
      ).expect(200);

      const task = parseToolText(res.body as JsonRpcResponse) as {
        dueStatus: { kind: string; basis?: string };
      };
      expect(task.dueStatus).toBeDefined();
      expect(task.dueStatus.kind).not.toBe('untracked');
    });

    it('list_log_entries by task', async () => {
      const res = await mcpPost(
        jsonrpc(
          'tools/call',
          { name: 'list_log_entries', arguments: { taskId: TASK_ID } },
          14,
        ),
      ).expect(200);

      const entries = parseToolText(res.body as JsonRpcResponse) as {
        id: string;
      }[];
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ id: LOG_ENTRY_ID });
    });

    it("owner scoping: another owner's rig behaves as not found", async () => {
      const res = await mcpPost(
        jsonrpc(
          'tools/call',
          { name: 'get_rig', arguments: { id: OTHER_RIG_ID } },
          15,
        ),
      ).expect(200);

      const body = res.body as JsonRpcResponse;
      const result = body.result as ToolCallResult;
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toBe('Rig not found');
    });

    it('reads on missing records report not found, not a server error', async () => {
      const cases = [
        {
          name: 'get_rig',
          arguments: { id: OTHER_RIG_ID },
          text: 'Rig not found',
        },
        {
          name: 'get_checklist',
          arguments: { id: OTHER_RIG_ID },
          text: 'Checklist not found',
        },
        {
          name: 'get_run',
          arguments: { id: OTHER_RIG_ID },
          text: 'Run not found',
        },
        {
          name: 'get_maintenance_task',
          arguments: { id: OTHER_RIG_ID },
          text: 'Maintenance task not found',
        },
        {
          name: 'list_checklists',
          arguments: { rigId: OTHER_RIG_ID },
          text: 'Rig not found',
        },
        {
          name: 'list_runs',
          arguments: { rigId: OTHER_RIG_ID },
          text: 'Rig not found',
        },
        {
          name: 'list_maintenance_tasks',
          arguments: { rigId: OTHER_RIG_ID },
          text: 'Rig not found',
        },
        {
          name: 'list_log_entries',
          arguments: { rigId: OTHER_RIG_ID },
          text: 'Rig not found',
        },
      ];

      for (const [i, c] of cases.entries()) {
        const res = await mcpPost(
          jsonrpc(
            'tools/call',
            { name: c.name, arguments: c.arguments },
            40 + i,
          ),
        ).expect(200);

        const result = (res.body as JsonRpcResponse).result as ToolCallResult;
        expect(result.isError).toBe(true);
        expect(result.content[0]?.text).toBe(c.text);
      }
    });

    it('checklist create / update / delete round-trip', async () => {
      const res1 = await mcpPost(
        jsonrpc(
          'tools/call',
          {
            name: 'create_checklist',
            arguments: {
              rigId: RIG_ID,
              name: 'Winterize',
              steps: [{ text: 'Drain water heater' }],
            },
          },
          20,
        ),
      ).expect(200);

      const created = parseToolText(res1.body as JsonRpcResponse) as {
        id: string;
        name: string;
        steps: { id: string; text: string }[];
      };
      expect(created.name).toBe('Winterize');
      expect(created.steps).toHaveLength(1);
      expect(created.steps[0]?.text).toBe('Drain water heater');

      // Update — replaces the full step list
      const res2 = await mcpPost(
        jsonrpc(
          'tools/call',
          {
            name: 'update_checklist',
            arguments: {
              id: created.id,
              name: 'Winterize v2',
              steps: [
                { id: created.steps[0]?.id, text: 'Drain water heater' },
                { text: 'Bypass water heater' },
              ],
            },
          },
          21,
        ),
      ).expect(200);

      const updated = parseToolText(res2.body as JsonRpcResponse) as {
        id: string;
        name: string;
        steps: { text: string }[];
      };
      expect(updated.name).toBe('Winterize v2');
      expect(updated.steps).toHaveLength(2);

      // Delete
      const res3 = await mcpPost(
        jsonrpc(
          'tools/call',
          { name: 'delete_checklist', arguments: { id: created.id } },
          22,
        ),
      ).expect(200);

      const removed = (res3.body as JsonRpcResponse).result as ToolCallResult;
      expect(removed.isError).toBeUndefined();

      // Confirm deleted — a subsequent read returns an error
      const res4 = await mcpPost(
        jsonrpc(
          'tools/call',
          { name: 'get_checklist', arguments: { id: created.id } },
          23,
        ),
      ).expect(200);

      const notFound = (res4.body as JsonRpcResponse).result as ToolCallResult;
      expect(notFound.isError).toBe(true);
      expect(notFound.content[0]?.text).toBe('Checklist not found');
    });

    it('maintenance task create / update / delete round-trip', async () => {
      const res1 = await mcpPost(
        jsonrpc(
          'tools/call',
          {
            name: 'create_maintenance_task',
            arguments: {
              rigId: RIG_ID,
              name: 'Replace engine oil',
              interval: { km: 10_000 },
            },
          },
          30,
        ),
      ).expect(200);

      const created = parseToolText(res1.body as JsonRpcResponse) as {
        id: string;
        name: string;
        interval: { km: number };
      };
      expect(created.name).toBe('Replace engine oil');
      expect(created.interval).toEqual({ km: 10_000 });

      // Update — switch to combined interval
      const res2 = await mcpPost(
        jsonrpc(
          'tools/call',
          {
            name: 'update_maintenance_task',
            arguments: {
              id: created.id,
              name: 'Replace engine oil and filter',
              interval: { months: 12, km: 10_000 },
            },
          },
          31,
        ),
      ).expect(200);

      const updated = parseToolText(res2.body as JsonRpcResponse) as {
        id: string;
        name: string;
        interval: { months: number; km: number };
      };
      expect(updated.name).toBe('Replace engine oil and filter');
      expect(updated.interval).toEqual({ months: 12, km: 10_000 });

      // Delete
      const res3 = await mcpPost(
        jsonrpc(
          'tools/call',
          {
            name: 'delete_maintenance_task',
            arguments: { id: created.id },
          },
          32,
        ),
      ).expect(200);

      const removed = (res3.body as JsonRpcResponse).result as ToolCallResult;
      expect(removed.isError).toBeUndefined();

      // Confirm deleted — a subsequent read returns an error
      const res4 = await mcpPost(
        jsonrpc(
          'tools/call',
          {
            name: 'get_maintenance_task',
            arguments: { id: created.id },
          },
          33,
        ),
      ).expect(200);

      const notFound = (res4.body as JsonRpcResponse).result as ToolCallResult;
      expect(notFound.isError).toBe(true);
      expect(notFound.content[0]?.text).toBe('Maintenance task not found');
    });
  });

  // -- tools/call (JWT) ----------------------------------------------------

  describe('tools/call (JWT)', () => {
    beforeEach(async () => {
      await mcpPostJwt(
        jsonrpc('initialize', {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client-jwt', version: '1.0' },
        }),
      ).expect(200);
    });

    it("list_rigs returns the same owner's rigs via JWT", async () => {
      const res = await mcpPostJwt(
        jsonrpc('tools/call', { name: 'list_rigs', arguments: {} }, 50),
      ).expect(200);

      const rigs = parseToolText(res.body as JsonRpcResponse) as {
        id: string;
        nickname: string;
      }[];
      expect(rigs).toHaveLength(1);
      expect(rigs[0]).toMatchObject({ nickname: 'Bigfoot' });
    });

    it('lists all fifteen tools via JWT', async () => {
      const res = await mcpPostJwt(jsonrpc('tools/list', {}, 51)).expect(200);

      const body = res.body as JsonRpcResponse;
      const result = body.result as { tools: { name: string }[] };
      expect(result.tools).toHaveLength(15);
    });
  });
});

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
import {
  ChecklistRepository,
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
import { RigService } from '../rig/rig.service.js';
import { RunService } from '../run/run.service.js';
import { McpToolsController } from './mcp-tools.controller.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const USER_ID = 'user-mcp-int';
const USER_EMAIL = 'mcp-int@example.com';
const OTHER_USER_ID = 'user-other';

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

void RUN_ID;
void CHECKLIST_ID;

async function seedData(repos: {
  rigs: InMemoryRigRepository;
  checklists: InMemoryChecklistRepository;
  runs: InMemoryRunRepository;
  tasks: InMemoryMaintenanceTaskRepository;
  logEntries: InMemoryLogEntryRepository;
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
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('MCP endpoint integration (ADR-0021, ADR-0023)', () => {
  let app: INestApplication;
  let server: App;
  let mcpToken: string;

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

  beforeAll(async () => {
    await seedData({
      rigs: rigRepo,
      checklists: checklistRepo,
      runs: runRepo,
      tasks: taskRepo,
      logEntries: logEntryRepo,
    });

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
        { provide: ChecklistRepository, useValue: checklistRepo },
        { provide: RunRepository, useValue: runRepo },
        { provide: MaintenanceTaskRepository, useValue: taskRepo },
        { provide: LogEntryRepository, useValue: logEntryRepo },
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

  // -- Authentication -------------------------------------------------------

  describe('authentication', () => {
    it('rejects requests with no token (plain 401)', async () => {
      await request(server)
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
    });

    it('rejects requests with an invalid token', async () => {
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

    it('does not return WWW-Authenticate header', async () => {
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
      expect(res.headers['www-authenticate']).toBeUndefined();
    });
  });

  // -- MCP protocol ---------------------------------------------------------

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

  // -- tools/call -----------------------------------------------------------

  describe('tools/call', () => {
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

    it('get_rig returns a single rig', async () => {
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
      };
      expect(rig.id).toBe(RIG_ID);
      expect(rig.distanceKm).toBe(45_000);
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
    });
  });
});

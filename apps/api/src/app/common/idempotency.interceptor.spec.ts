import {
  type CallHandler,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE, Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  AttachmentRepository,
  IdempotencyKeyRepository,
  LogEntryRepository,
  MaintenanceTaskRepository,
  RigRepository,
  StopRepository,
  TripRepository,
  type RecordedResponse,
  type RecordResponseInput,
} from '@rv-checklist/api-data-access';
import type { Owner, Rig, Trip } from '@rv-checklist/domain';
import {
  InMemoryAttachmentRepository,
  InMemoryLogEntryRepository,
  InMemoryMaintenanceTaskRepository,
  InMemoryRigRepository,
  InMemoryStopRepository,
  InMemoryTripRepository,
} from '@rv-checklist/domain/testing';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { firstValueFrom, isObservable, of } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards.js';
import { LogEntryController } from '../maintenance/log-entry.controller.js';
import { LogEntryService } from '../maintenance/log-entry.service.js';
import { InMemoryObjectStorage } from '../storage/in-memory-object-storage.js';
import { ObjectStorage } from '../storage/object-storage.js';
import { StopController } from '../trips/stop.controller.js';
import { StopService } from '../trips/stop.service.js';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';

const owner: Owner = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'owner@example.com',
  name: undefined,
  picture: undefined,
};

const rigId = '550e8400-e29b-41d4-a716-446655440010';
const tripId = '550e8400-e29b-41d4-a716-446655440030';
const rig: Rig = {
  id: rigId,
  ownerId: owner.id,
  nickname: 'Silver Bullet',
  distanceKm: 1000,
};
const trip: Trip = {
  id: tripId,
  rigId,
  name: 'Fall colours loop',
  checklistIds: [],
};

/** Client-generated uuids, one per "queued operation" (ADR-0028). */
const keyA = '11111111-1111-4111-8111-111111111111';
const keyB = '22222222-2222-4222-8222-222222222222';
const keyC = '33333333-3333-4333-8333-333333333333';
const keyD = '44444444-4444-4444-8444-444444444444';

/**
 * In-memory {@link IdempotencyKeyRepository} — the test-side binding of the
 * dedup ledger, mirroring the `@rv-checklist/domain/testing` doubles. `rows`
 * is exposed so a test can backdate an entry to exercise retention.
 */
class InMemoryIdempotencyKeyRepository extends IdempotencyKeyRepository {
  readonly rows = new Map<
    string,
    { recorded: RecordedResponse; createdAt: Date }
  >();

  find(userId: string, key: string): Promise<RecordedResponse | undefined> {
    return Promise.resolve(this.rows.get(`${userId}:${key}`)?.recorded);
  }

  record(input: RecordResponseInput): Promise<void> {
    const mapKey = `${input.userId}:${input.key}`;
    if (!this.rows.has(mapKey)) {
      this.rows.set(mapKey, {
        recorded: { status: input.status, body: input.body },
        createdAt: new Date(),
      });
    }
    return Promise.resolve();
  }

  prune(olderThanDays: number): Promise<number> {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    let pruned = 0;
    for (const [mapKey, row] of this.rows) {
      if (row.createdAt.getTime() >= cutoff) {
        continue;
      }
      this.rows.delete(mapKey);
      pruned += 1;
    }
    return Promise.resolve(pruned);
  }
}

const guardAs = (user: Owner) => ({
  canActivate: (ctx: ExecutionContext) => {
    ctx.switchToHttp().getRequest<{ user: Owner }>().user = user;
    return true;
  },
});

/** The global interceptor stack exactly as `app.module.ts` orders it: idempotency outermost. */
const globalStack = (keys: IdempotencyKeyRepository) => [
  { provide: IdempotencyKeyRepository, useValue: keys },
  { provide: APP_PIPE, useClass: ZodValidationPipe },
  { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
];

describe('IdempotencyInterceptor over the stop surface (trap: arrived-leg Distance delta)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let rigs: InMemoryRigRepository;
  let stops: InMemoryStopRepository;
  let keys: InMemoryIdempotencyKeyRepository;

  beforeAll(async () => {
    rigs = new InMemoryRigRepository();
    await rigs.save(rig);
    const trips = new InMemoryTripRepository();
    await trips.save(trip);
    stops = new InMemoryStopRepository();
    keys = new InMemoryIdempotencyKeyRepository();

    const moduleRef = await Test.createTestingModule({
      controllers: [StopController],
      providers: [
        StopService,
        { provide: StopRepository, useValue: stops },
        { provide: TripRepository, useValue: trips },
        { provide: RigRepository, useValue: rigs },
        {
          provide: AttachmentRepository,
          useValue: new InMemoryAttachmentRepository(),
        },
        { provide: ObjectStorage, useValue: new InMemoryObjectStorage() },
        ...globalStack(keys),
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(guardAs(owner))
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  const createArrivedStop = async (legKm: number): Promise<string> => {
    const created = await fetch(`${baseUrl}/stops`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tripId, legKm }),
    });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const arrived = await fetch(`${baseUrl}/stops/${id}/arrival`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ arrived: true }),
    });
    expect(arrived.status).toBe(200);
    return id;
  };

  const distance = async (): Promise<number | undefined> => {
    const found = await rigs.findById(rigId);
    return found?.distanceKm;
  };

  it('applies a keyed arrived-leg edit once: the replay returns the recorded response and moves nothing', async () => {
    const id = await createArrivedStop(200);
    const before = await distance();

    const patch = () =>
      fetch(`${baseUrl}/stops/${id}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': keyA,
        },
        body: JSON.stringify({ legKm: 300 }),
      });

    const first = await patch();
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as Record<string, unknown>;
    expect(firstBody['legKm']).toBe(300);
    expect(await distance()).toBe((before ?? 0) + 100);

    const replay = await patch();
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual(firstBody);
    // The delta applied exactly once — the trap this ticket exists for.
    expect(await distance()).toBe((before ?? 0) + 100);
  });

  it('replays the recorded response even if the resource moved on since (handler never runs)', async () => {
    const id = await createArrivedStop(0);

    const keyed = await fetch(`${baseUrl}/stops/${id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': keyB,
      },
      body: JSON.stringify({ nights: 4 }),
    });
    expect(keyed.status).toBe(200);

    // A later, un-keyed edit moves the stored state past the recorded outcome.
    const later = await fetch(`${baseUrl}/stops/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nights: 5 }),
    });
    expect(later.status).toBe(200);

    const replay = await fetch(`${baseUrl}/stops/${id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': keyB,
      },
      body: JSON.stringify({ nights: 4 }),
    });
    expect(replay.status).toBe(200);
    const replayBody = (await replay.json()) as Record<string, unknown>;
    // The recorded outcome, not a re-execution: stored state keeps the later edit.
    expect(replayBody['nights']).toBe(4);
    const stored = await stops.findById(id);
    expect(stored?.nights).toBe(5);
  });

  it('changes nothing without the header: the same edit repeated applies twice, exactly as today', async () => {
    const id = await createArrivedStop(100);
    const before = await distance();
    const ledgerSizeBefore = keys.rows.size;

    // legKm 100 -> 150 (+50), then 150 -> 150... use two distinct edits that
    // each move the Distance, proving no dedup path is taken.
    const edit = (legKm: number) =>
      fetch(`${baseUrl}/stops/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ legKm }),
      });

    const firstEdit = await edit(150);
    expect(firstEdit.status).toBe(200);
    expect(await distance()).toBe((before ?? 0) + 50);
    const secondEdit = await edit(200);
    expect(secondEdit.status).toBe(200);
    expect(await distance()).toBe((before ?? 0) + 100);
    expect(keys.rows.size).toBe(ledgerSizeBefore);
  });

  it('rejects a malformed (non-uuid) key with 400', async () => {
    const id = await createArrivedStop(0);

    const response = await fetch(`${baseUrl}/stops/${id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': 'not-a-uuid',
      },
      body: JSON.stringify({ nights: 2 }),
    });
    expect(response.status).toBe(400);
  });

  it('replays a bodiless 204 delete faithfully (no 404 on the replay)', async () => {
    const id = await createArrivedStop(0);

    const doDelete = () =>
      fetch(`${baseUrl}/stops/${id}`, {
        method: 'DELETE',
        headers: { 'Idempotency-Key': keyC },
      });

    const first = await doDelete();
    expect(first.status).toBe(204);
    expect(await stops.findById(id)).toBeUndefined();

    // Without the ledger this would 404 — the stop is gone.
    const replay = await doDelete();
    expect(replay.status).toBe(204);
    expect(await replay.text()).toBe('');
  });

  it('prunes expired rows opportunistically on each recorded write (60-day retention)', async () => {
    const id = await createArrivedStop(0);
    const staleMapKey = `${owner.id}:${keyB}`;
    const stale = keys.rows.get(staleMapKey);
    expect(stale).toBeDefined();
    if (stale) {
      stale.createdAt = new Date(Date.now() - 61 * 24 * 60 * 60 * 1000);
    }

    const keyed = await fetch(`${baseUrl}/stops/${id}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': keyD,
      },
      body: JSON.stringify({ nights: 1 }),
    });
    expect(keyed.status).toBe(200);

    // The fire-and-forget prune resolves on the microtask queue, well inside
    // the HTTP round trip above; poll briefly to keep this deterministic.
    for (let i = 0; i < 50 && keys.rows.has(staleMapKey); i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(keys.rows.has(staleMapKey)).toBe(false);
    expect(keys.rows.has(`${owner.id}:${keyD}`)).toBe(true);
  });
});

describe('IdempotencyInterceptor over log entries (trap: completing a one-time task deletes it)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let tasks: InMemoryMaintenanceTaskRepository;
  let logEntries: InMemoryLogEntryRepository;

  const taskId = '550e8400-e29b-41d4-a716-446655440050';

  beforeAll(async () => {
    const rigs = new InMemoryRigRepository();
    await rigs.save(rig);
    tasks = new InMemoryMaintenanceTaskRepository();
    await tasks.save({
      id: taskId,
      rigId,
      name: 'Install hitch stabiliser',
      oneTime: true,
      fieldSchema: [],
      tags: [],
    });
    logEntries = new InMemoryLogEntryRepository();

    const moduleRef = await Test.createTestingModule({
      controllers: [LogEntryController],
      providers: [
        LogEntryService,
        { provide: LogEntryRepository, useValue: logEntries },
        { provide: MaintenanceTaskRepository, useValue: tasks },
        { provide: RigRepository, useValue: rigs },
        ...globalStack(new InMemoryIdempotencyKeyRepository()),
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(guardAs(owner))
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the original 201 on replay after the first call deleted the task', async () => {
    const post = () =>
      fetch(`${baseUrl}/log-entries`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'Idempotency-Key': keyA,
        },
        body: JSON.stringify({
          taskId,
          performedOn: '2026-08-01',
          fields: [],
        }),
      });

    const first = await post();
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as Record<string, unknown>;
    expect(firstBody['taskName']).toBe('Install hitch stabiliser');
    // The one-time task consumed itself — a naive replay would now 404.
    expect(await tasks.findById(taskId)).toBeUndefined();

    const replay = await post();
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(firstBody);
    expect(await logEntries.listByRig(rigId)).toHaveLength(1);
  });
});

/** Stand-in for a route handler — the interceptor only reads its metadata. */
function routeHandler(): void {
  // Never invoked.
}

interface UnitRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  user?: Owner;
}

const contextFor = (request: UnitRequest): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ url: request.path, ...request }),
      getResponse: () => ({ status: jest.fn() }),
    }),
    getHandler: () => routeHandler,
  }) as unknown as ExecutionContext;

describe('IdempotencyInterceptor pass-through rules (unit)', () => {
  let keys: InMemoryIdempotencyKeyRepository;
  let findSpy: jest.SpyInstance;
  let interceptor: IdempotencyInterceptor;
  let handle: jest.Mock;
  let next: CallHandler;

  beforeEach(() => {
    keys = new InMemoryIdempotencyKeyRepository();
    findSpy = jest.spyOn(keys, 'find');
    interceptor = new IdempotencyInterceptor(keys, new Reflector());
    handle = jest.fn(() => of('handled'));
    next = { handle };
  });

  const expectPassThrough = async (request: UnitRequest): Promise<void> => {
    const result = await interceptor.intercept(contextFor(request), next);
    expect(isObservable(result)).toBe(true);
    expect(await firstValueFrom(result)).toBe('handled');
    expect(handle).toHaveBeenCalledTimes(1);
    expect(findSpy).not.toHaveBeenCalled();
    expect(keys.rows.size).toBe(0);
  };

  it('ignores non-mutating methods, keyed or not', async () => {
    await expectPassThrough({
      method: 'GET',
      path: '/api/stops/abc',
      headers: { 'idempotency-key': keyA },
      user: owner,
    });
  });

  it('ignores requests without the header', async () => {
    await expectPassThrough({
      method: 'POST',
      path: '/api/stops',
      headers: {},
      user: owner,
    });
  });

  it('ignores unauthenticated requests', async () => {
    await expectPassThrough({
      method: 'POST',
      path: '/api/stops',
      headers: { 'idempotency-key': keyA },
    });
  });

  it('never records the credential-bearing routes', async () => {
    for (const path of [
      '/api/auth/refresh',
      '/auth/refresh',
      '/api/mcp-token',
      '/api/token',
      '/api/register',
      '/api/authorize',
      '/.well-known/oauth-authorization-server',
    ]) {
      await expectPassThrough({
        method: 'POST',
        path,
        headers: { 'idempotency-key': keyA },
        user: owner,
      });
      handle.mockClear();
    }
  });

  it('still intercepts ordinary domain routes under the same test harness', async () => {
    const result = await interceptor.intercept(
      contextFor({
        method: 'POST',
        path: '/api/log-entries',
        headers: { 'idempotency-key': keyA },
        user: owner,
      }),
      next,
    );
    expect(await firstValueFrom(result)).toBe('handled');
    expect(findSpy).toHaveBeenCalledWith(owner.id, keyA);
    expect(keys.rows.get(`${owner.id}:${keyA}`)?.recorded.status).toBe(201);
  });
});

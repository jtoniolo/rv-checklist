import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  LogEntryRepository,
  MaintenanceTaskRepository,
  RigRepository,
} from '@rv-checklist/api-data-access';
import type { Owner, Rig } from '@rv-checklist/domain';
import {
  InMemoryLogEntryRepository,
  InMemoryMaintenanceTaskRepository,
  InMemoryRigRepository,
} from '@rv-checklist/domain/testing';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { JwtAuthGuard } from '../auth/guards.js';
import { LogEntryController } from './log-entry.controller.js';
import { LogEntryService } from './log-entry.service.js';
import { MaintenanceTaskController } from './maintenance-task.controller.js';
import { MaintenanceTaskService } from './maintenance-task.service.js';

const owner: Owner = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'owner@example.com',
  name: undefined,
  picture: undefined,
};

const rigId = '550e8400-e29b-41d4-a716-446655440010';
const rig: Rig = { id: rigId, ownerId: owner.id, nickname: 'Silver Bullet' };

const jsonPost = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

/**
 * Exercises the maintenance HTTP surface through the *real* global
 * `ZodSerializerInterceptor` and `ZodValidationPipe`, exactly as
 * `app.module.ts` wires them — the seam the service-level specs bypass. This
 * is where the shared-schema field rules bite over the wire: `photo` and
 * duplicate field names must 400 (issue #17's acceptance criteria), and the
 * array list routes must serialize as `[Dto]`.
 */
describe('Maintenance controllers over HTTP (through the Zod serializer)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const rigs = new InMemoryRigRepository();
    await rigs.save(rig);

    const moduleRef = await Test.createTestingModule({
      controllers: [MaintenanceTaskController, LogEntryController],
      providers: [
        MaintenanceTaskService,
        LogEntryService,
        {
          provide: MaintenanceTaskRepository,
          useValue: new InMemoryMaintenanceTaskRepository(),
        },
        {
          provide: LogEntryRepository,
          useValue: new InMemoryLogEntryRepository(),
        },
        { provide: RigRepository, useValue: rigs },
        { provide: APP_PIPE, useClass: ZodValidationPipe },
        { provide: APP_INTERCEPTOR, useClass: ZodSerializerInterceptor },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest<{ user: Owner }>().user = owner;
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a task and lists it as a 200 JSON array', async () => {
    const created = await fetch(
      `${baseUrl}/tasks`,
      jsonPost({
        rigId,
        name: 'Condition slide seals',
        interval: { months: 12 },
        fieldSchema: [
          {
            name: 'Tire Pressure',
            type: 'number',
            required: true,
            unit: 'psi',
          },
        ],
      }),
    );
    expect(created.status).toBe(201);
    const task = (await created.json()) as { id: string };

    const listed = await fetch(`${baseUrl}/tasks?rigId=${rigId}`);
    expect(listed.status).toBe(200);
    const body: unknown = await listed.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([
      expect.objectContaining({ id: task.id, name: 'Condition slide seals' }),
    ]);
  });

  it('rejects a `photo` field with a 400 (ADR-0010)', async () => {
    const created = await fetch(
      `${baseUrl}/tasks`,
      jsonPost({
        rigId,
        name: 'Inspect roof',
        fieldSchema: [{ name: 'Roof photo', type: 'photo', required: false }],
      }),
    );
    expect(created.status).toBe(400);
  });

  it('rejects duplicate field names within a task with a 400', async () => {
    const created = await fetch(
      `${baseUrl}/tasks`,
      jsonPost({
        rigId,
        name: 'Inspect roof',
        fieldSchema: [
          { name: 'Notes', type: 'note', required: false },
          { name: 'Notes', type: 'text', required: false },
        ],
      }),
    );
    expect(created.status).toBe(400);
  });

  it('removes the interval with PATCH `interval: null`', async () => {
    const created = await fetch(
      `${baseUrl}/tasks`,
      jsonPost({ rigId, name: 'Flush water heater', interval: { months: 6 } }),
    );
    const task = (await created.json()) as { id: string };

    const patched = await fetch(`${baseUrl}/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      // eslint-disable-next-line unicorn/no-null -- `null` is the wire's removal marker
      body: JSON.stringify({ interval: null }),
    });
    expect(patched.status).toBe(200);
    const updated = (await patched.json()) as { interval?: unknown };
    expect(updated.interval).toBeUndefined();
  });

  it('round-trips a description and clears it with PATCH `description: null`', async () => {
    const created = await fetch(
      `${baseUrl}/tasks`,
      jsonPost({
        rigId,
        name: 'Condition roof seals',
        description: 'UV bakes the sealant.\nInspect seams, then re-seal.',
      }),
    );
    expect(created.status).toBe(201);
    const task = (await created.json()) as {
      id: string;
      description?: string;
    };
    expect(task.description).toBe(
      'UV bakes the sealant.\nInspect seams, then re-seal.',
    );

    const cleared = await fetch(`${baseUrl}/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      // eslint-disable-next-line unicorn/no-null -- `null` is the wire's removal marker
      body: JSON.stringify({ description: null }),
    });
    expect(cleared.status).toBe(200);
    const updated = (await cleared.json()) as { description?: unknown };
    expect(updated.description).toBeUndefined();
  });

  it('performs a task standalone and reads back its log history', async () => {
    const created = await fetch(
      `${baseUrl}/tasks`,
      jsonPost({
        rigId,
        name: 'Repack wheel bearings',
        fieldSchema: [{ name: 'Grease used', type: 'text', required: false }],
      }),
    );
    const task = (await created.json()) as { id: string };

    const performed = await fetch(
      `${baseUrl}/log-entries`,
      jsonPost({
        taskId: task.id,
        performedOn: '2026-07-21',
        fields: [
          {
            name: 'Grease used',
            type: 'text',
            required: false,
            value: 'Lucas Red N Tacky',
          },
        ],
      }),
    );
    expect(performed.status).toBe(201);
    const entry = (await performed.json()) as { id: string };

    const history = await fetch(`${baseUrl}/log-entries?taskId=${task.id}`);
    expect(history.status).toBe(200);
    const body: unknown = await history.json();
    expect(body).toEqual([
      expect.objectContaining({
        id: entry.id,
        performedOn: '2026-07-21',
        fields: [
          expect.objectContaining({
            name: 'Grease used',
            value: 'Lucas Red N Tacky',
          }),
        ],
      }),
    ]);
  });

  it('editing a description leaves existing log entries untouched (issue #25)', async () => {
    const created = await fetch(
      `${baseUrl}/tasks`,
      jsonPost({ rigId, name: 'Inspect brake pads' }),
    );
    const task = (await created.json()) as { id: string };
    const performed = await fetch(
      `${baseUrl}/log-entries`,
      jsonPost({ taskId: task.id, performedOn: '2026-06-01', fields: [] }),
    );
    const entry: unknown = await performed.json();

    const patched = await fetch(`${baseUrl}/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ description: 'Squealing means too late.' }),
    });
    expect(patched.status).toBe(200);

    const history = await fetch(`${baseUrl}/log-entries?taskId=${task.id}`);
    expect(await history.json()).toEqual([entry]);
  });

  it('lists a rig’s entries via ?rigId= (the due-status read)', async () => {
    const listed = await fetch(`${baseUrl}/log-entries?rigId=${rigId}`);
    expect(listed.status).toBe(200);
    expect(Array.isArray(await listed.json())).toBe(true);
  });

  it('rejects a log-entry list request with neither taskId nor rigId', async () => {
    const listed = await fetch(`${baseUrl}/log-entries`);
    expect(listed.status).toBe(400);
  });

  it('rejects a log-entry list request with both taskId and rigId', async () => {
    const listed = await fetch(
      `${baseUrl}/log-entries?taskId=${rigId}&rigId=${rigId}`,
    );
    expect(listed.status).toBe(400);
  });
});

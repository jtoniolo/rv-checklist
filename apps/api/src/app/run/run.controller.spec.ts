import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  ChecklistRepository,
  LogEntryRepository,
  MaintenanceTaskRepository,
  RigRepository,
  RunRepository,
} from '@rv-checklist/api-data-access';
import type { Checklist, Owner, Rig } from '@rv-checklist/domain';
import {
  InMemoryChecklistRepository,
  InMemoryLogEntryRepository,
  InMemoryMaintenanceTaskRepository,
  InMemoryRigRepository,
  InMemoryRunRepository,
} from '@rv-checklist/domain/testing';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { Clock, SystemClock } from '../auth/clock.js';
import { JwtAuthGuard } from '../auth/guards.js';
import { RunController } from './run.controller.js';
import { RunService } from './run.service.js';

const owner: Owner = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'owner@example.com',
  name: undefined,
  picture: undefined,
};

const rigId = '550e8400-e29b-41d4-a716-446655440010';
const checklistId = '550e8400-e29b-41d4-a716-446655440020';
const stepId = '550e8400-e29b-41d4-a716-446655440030';

const rig: Rig = { id: rigId, ownerId: owner.id, nickname: 'Silver Bullet' };
const checklist: Checklist = {
  id: checklistId,
  rigId,
  name: 'Pre-departure',
  tags: [],
  steps: [
    { id: stepId, text: 'Close roof vents' },
    {
      id: '550e8400-e29b-41d4-a716-446655440031',
      text: 'Fresh water level',
      fieldSchema: [
        { name: 'Level', type: 'number', required: true, unit: '%' },
      ],
    },
  ],
};

/**
 * Exercises the run HTTP surface through the *real* global
 * `ZodSerializerInterceptor` and `ZodValidationPipe`, exactly as `app.module.ts`
 * wires them — the seam the service-level spec bypasses. The list route returns
 * an array, so this guards against a `@ZodSerializerDto` mismatch (single vs
 * `[Dto]`) silently 500ing, and confirms a completed step's captured values
 * survive the PATCH round trip.
 */
describe('RunController over HTTP (through the Zod serializer)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const rigs = new InMemoryRigRepository();
    await rigs.save(rig);
    const checklists = new InMemoryChecklistRepository();
    await checklists.save(checklist);

    const moduleRef = await Test.createTestingModule({
      controllers: [RunController],
      providers: [
        RunService,
        { provide: RunRepository, useValue: new InMemoryRunRepository() },
        { provide: ChecklistRepository, useValue: checklists },
        { provide: RigRepository, useValue: rigs },
        {
          provide: MaintenanceTaskRepository,
          useValue: new InMemoryMaintenanceTaskRepository(),
        },
        {
          provide: LogEntryRepository,
          useValue: new InMemoryLogEntryRepository(),
        },
        { provide: Clock, useClass: SystemClock },
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

  it('starts a run, copies the steps, and lists it as a 200 JSON array', async () => {
    const started = await fetch(`${baseUrl}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ checklistId }),
    });
    expect(started.status).toBe(201);
    const run = (await started.json()) as {
      id: string;
      steps: { id: string; state: string }[];
    };
    expect(run.steps).toHaveLength(2);
    expect(run.steps[0]?.state).toBe('incomplete');
    // The run's step ids are its own copy, not the template's.
    expect(run.steps.map((s) => s.id)).not.toContain(stepId);

    const listed = await fetch(`${baseUrl}/runs?checklistId=${checklistId}`);
    expect(listed.status).toBe(200);
    const body: unknown = await listed.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([
      expect.objectContaining({ id: run.id, checklistId }),
    ]);
  });

  it('lists a rig’s runs across checklists via ?rigId= (issue #22)', async () => {
    const started = await fetch(`${baseUrl}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ checklistId }),
    });
    expect(started.status).toBe(201);

    const listed = await fetch(`${baseUrl}/runs?rigId=${rigId}`);
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { rigId: string }[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((run) => run.rigId === rigId)).toBe(true);
  });

  it('rejects a list request with neither checklistId nor rigId', async () => {
    const listed = await fetch(`${baseUrl}/runs`);
    expect(listed.status).toBe(400);
  });

  it('rejects a list request with both checklistId and rigId', async () => {
    const listed = await fetch(
      `${baseUrl}/runs?checklistId=${checklistId}&rigId=${rigId}`,
    );
    expect(listed.status).toBe(400);
  });

  it('captures a completed step’s values on PATCH and round-trips them', async () => {
    const started = await fetch(`${baseUrl}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ checklistId }),
    });
    const run = (await started.json()) as {
      id: string;
      steps: {
        id: string;
        text: string;
        fieldSchema?: unknown;
        state: string;
      }[];
    };

    const patched = await fetch(`${baseUrl}/runs/${run.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        steps: run.steps.map((s, i) =>
          i === 1
            ? {
                ...s,
                state: 'complete',
                values: [{ name: 'Level', value: 80 }],
              }
            : s,
        ),
      }),
    });
    expect(patched.status).toBe(200);
    const updated = (await patched.json()) as {
      steps: { state: string; values?: { name: string; value: unknown }[] }[];
    };
    expect(updated.steps[1]?.state).toBe('complete');
    expect(updated.steps[1]?.values).toEqual([{ name: 'Level', value: 80 }]);
  });

  it('rejects an unknown step state with a 400', async () => {
    const started = await fetch(`${baseUrl}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ checklistId }),
    });
    const run = (await started.json()) as {
      id: string;
      steps: { id: string; text: string }[];
    };

    const bad = await fetch(`${baseUrl}/runs/${run.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        steps: [{ ...run.steps[0], state: 'ticked' }],
      }),
    });
    expect(bad.status).toBe(400);
  });
});

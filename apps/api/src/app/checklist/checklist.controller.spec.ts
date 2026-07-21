import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  ChecklistRepository,
  RigRepository,
} from '@rv-checklist/api-data-access';
import type { Owner, Rig } from '@rv-checklist/domain';
import {
  InMemoryChecklistRepository,
  InMemoryRigRepository,
} from '@rv-checklist/domain/testing';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { JwtAuthGuard } from '../auth/guards.js';
import { ChecklistController } from './checklist.controller.js';
import { ChecklistService } from './checklist.service.js';

const owner: Owner = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'owner@example.com',
  name: undefined,
  picture: undefined,
};

const rigId = '550e8400-e29b-41d4-a716-446655440010';
const rig: Rig = { id: rigId, ownerId: owner.id, nickname: 'Silver Bullet' };

/**
 * Exercises the checklist HTTP surface through the *real* global
 * `ZodSerializerInterceptor` and `ZodValidationPipe`, exactly as `app.module.ts`
 * wires them — the seam the service-level spec bypasses. The list route returns
 * an array, so this guards against a `@ZodSerializerDto` mismatch (single vs
 * `[Dto]`) silently 500ing, and confirms a step's own `field_schema` survives
 * the round trip.
 */
describe('ChecklistController over HTTP (through the Zod serializer)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const rigs = new InMemoryRigRepository();
    await rigs.save(rig);

    const moduleRef = await Test.createTestingModule({
      controllers: [ChecklistController],
      providers: [
        ChecklistService,
        {
          provide: ChecklistRepository,
          useValue: new InMemoryChecklistRepository(),
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

  it('creates a checklist and lists it as a 200 JSON array', async () => {
    const created = await fetch(`${baseUrl}/checklists`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rigId,
        name: 'Pre-departure',
        tags: ['procedure'],
        steps: [
          { text: 'Close roof vents' },
          {
            text: 'Fresh water level',
            fieldSchema: [
              { name: 'Level', type: 'number', required: true, unit: '%' },
            ],
          },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { steps: { id: string }[] };
    expect(createdBody.steps).toHaveLength(2);
    expect(createdBody.steps[0]?.id).toEqual(expect.any(String));

    const listed = await fetch(`${baseUrl}/checklists?rigId=${rigId}`);
    expect(listed.status).toBe(200);

    const body: unknown = await listed.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([
      expect.objectContaining({ name: 'Pre-departure', rigId }),
    ]);
  });

  it('rejects a task-linked step that also defines its own fields (ADR-0008) with a 400', async () => {
    const bad = await fetch(`${baseUrl}/checklists`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rigId,
        name: 'Bad',
        steps: [
          {
            text: 'Condition slide seals',
            taskId: '550e8400-e29b-41d4-a716-446655440099',
            fieldSchema: [{ name: 'Level', type: 'number', required: true }],
          },
        ],
      }),
    });
    expect(bad.status).toBe(400);
  });
});

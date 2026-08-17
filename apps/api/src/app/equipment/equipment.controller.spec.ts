import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  EquipmentItemRepository,
  RigRepository,
} from '@rv-checklist/api-data-access';
import type { Owner, Rig } from '@rv-checklist/domain';
import {
  InMemoryEquipmentItemRepository,
  InMemoryRigRepository,
} from '@rv-checklist/domain/testing';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { JwtAuthGuard } from '../auth/guards.js';
import { EquipmentController } from './equipment.controller.js';
import { EquipmentService } from './equipment.service.js';

const owner: Owner = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'owner@example.com',
  name: undefined,
  picture: undefined,
};

const rigId = '550e8400-e29b-41d4-a716-446655440010';
const rig: Rig = { id: rigId, ownerId: owner.id, nickname: 'Silver Bullet' };

describe('EquipmentController over HTTP (through the Zod serializer)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const rigs = new InMemoryRigRepository();
    await rigs.save(rig);

    const moduleRef = await Test.createTestingModule({
      controllers: [EquipmentController],
      providers: [
        EquipmentService,
        {
          provide: EquipmentItemRepository,
          useValue: new InMemoryEquipmentItemRepository(),
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

  it('creates an equipment item and lists it as a 200 JSON array', async () => {
    const created = await fetch(`${baseUrl}/equipment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rigId, name: 'Onan generator' }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { id: string; name: string };
    expect(createdBody.id).toEqual(expect.any(String));
    expect(createdBody.name).toBe('Onan generator');

    const listed = await fetch(`${baseUrl}/equipment?rigId=${rigId}`);
    expect(listed.status).toBe(200);

    const body: unknown = await listed.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([
      expect.objectContaining({ name: 'Onan generator', rigId }),
    ]);
  });

  it('renames an equipment item with PATCH', async () => {
    const created = await fetch(`${baseUrl}/equipment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rigId, name: 'Solar panel' }),
    });
    const { id } = (await created.json()) as { id: string };

    const patched = await fetch(`${baseUrl}/equipment/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Solar panel 400W' }),
    });
    expect(patched.status).toBe(200);
    const body = (await patched.json()) as { name: string };
    expect(body.name).toBe('Solar panel 400W');
  });

  it('creates an item with detail fields and lists them back', async () => {
    const created = await fetch(`${baseUrl}/equipment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rigId,
        name: 'Inverter',
        make: 'Victron',
        model: 'MultiPlus 3000',
        purchaseDate: '2024-06-01',
        notes: '5-year warranty',
        costCents: 289_900,
      }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      name: 'Inverter',
      make: 'Victron',
      model: 'MultiPlus 3000',
      purchaseDate: '2024-06-01',
      notes: '5-year warranty',
      costCents: 289_900,
    });
  });

  it('patches detail fields and clears one with null', async () => {
    const created = await fetch(`${baseUrl}/equipment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rigId,
        name: 'Battery',
        make: 'Battle Born',
        costCents: 94_900,
      }),
    });
    const { id } = (await created.json()) as { id: string };

    const patched = await fetch(`${baseUrl}/equipment/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      // eslint-disable-next-line unicorn/no-null
      body: JSON.stringify({ make: null, model: '100Ah LiFePO4' }),
    });
    expect(patched.status).toBe(200);
    const body = (await patched.json()) as Record<string, unknown>;
    expect(body['make']).toBeUndefined();
    expect(body['model']).toBe('100Ah LiFePO4');
    expect(body['costCents']).toBe(94_900);
  });

  it('deletes an equipment item with 204', async () => {
    const created = await fetch(`${baseUrl}/equipment`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rigId, name: 'Temporary item' }),
    });
    const { id } = (await created.json()) as { id: string };

    const deleted = await fetch(`${baseUrl}/equipment/${id}`, {
      method: 'DELETE',
    });
    expect(deleted.status).toBe(204);
  });
});

import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { RigRepository } from '@rv-checklist/api-data-access';
import type { Owner } from '@rv-checklist/domain';
import { InMemoryRigRepository } from '@rv-checklist/domain/testing';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { JwtAuthGuard } from '../auth/guards.js';
import { RigController } from './rig.controller.js';
import { RigService } from './rig.service.js';

const owner: Owner = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'owner@example.com',
  name: undefined,
  picture: undefined,
};

/**
 * Exercises the rig HTTP surface through the *real* global `ZodSerializerInterceptor`
 * and `ZodValidationPipe`, exactly as `app.module.ts` wires them — the seam the
 * service-level spec bypasses. The list route returns an array, so this is the guard
 * that a `@ZodSerializerDto` mismatch (single vs `[Dto]`) can never silently 500 again.
 */
describe('RigController over HTTP (through the Zod serializer)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [RigController],
      providers: [
        RigService,
        { provide: RigRepository, useValue: new InMemoryRigRepository() },
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

  it('lists the owner rigs as a 200 JSON array', async () => {
    const created = await fetch(`${baseUrl}/rigs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: 'Silver Bullet' }),
    });
    expect(created.status).toBe(201);

    const listed = await fetch(`${baseUrl}/rigs`);
    expect(listed.status).toBe(200);

    const body: unknown = await listed.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual([
      expect.objectContaining({ nickname: 'Silver Bullet', ownerId: owner.id }),
    ]);
  });
});

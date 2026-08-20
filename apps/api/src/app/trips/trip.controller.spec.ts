import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  AttachmentRepository,
  ChecklistRepository,
  RigRepository,
  StopRepository,
  TripRepository,
} from '@rv-checklist/api-data-access';
import type { Owner, Rig } from '@rv-checklist/domain';
import {
  InMemoryAttachmentRepository,
  InMemoryChecklistRepository,
  InMemoryRigRepository,
  InMemoryStopRepository,
  InMemoryTripRepository,
} from '@rv-checklist/domain/testing';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { JwtAuthGuard } from '../auth/guards.js';
import { InMemoryObjectStorage } from '../storage/in-memory-object-storage.js';
import { ObjectStorage } from '../storage/object-storage.js';
import { StopController } from './stop.controller.js';
import { StopService } from './stop.service.js';
import { TripController } from './trip.controller.js';
import { TripService } from './trip.service.js';

const owner: Owner = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'owner@example.com',
  name: undefined,
  picture: undefined,
};

const rigId = '550e8400-e29b-41d4-a716-446655440010';
const rig: Rig = { id: rigId, ownerId: owner.id, nickname: 'Silver Bullet' };

/**
 * Exercises the trip HTTP surface through the *real* global
 * `ZodSerializerInterceptor` and `ZodValidationPipe`, exactly as
 * `app.module.ts` wires them. The list route returns an array, so this guards
 * against a `@ZodSerializerDto` mismatch silently 500ing, and confirms the
 * read shape — embedded ordered stops and the derived status — survives the
 * round trip.
 */
describe('TripController over HTTP (through the Zod serializer)', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const rigs = new InMemoryRigRepository();
    await rigs.save(rig);
    // The trip repository is wired with the stop repository so the atomic
    // create-with-stops (issue #120) is visible through the stop read path,
    // as the shared database makes it in production.
    const stops = new InMemoryStopRepository();

    const moduleRef = await Test.createTestingModule({
      controllers: [TripController, StopController],
      providers: [
        TripService,
        StopService,
        {
          provide: TripRepository,
          useValue: new InMemoryTripRepository(stops),
        },
        { provide: StopRepository, useValue: stops },
        {
          provide: ChecklistRepository,
          useValue: new InMemoryChecklistRepository(),
        },
        { provide: RigRepository, useValue: rigs },
        {
          provide: AttachmentRepository,
          useValue: new InMemoryAttachmentRepository(),
        },
        { provide: ObjectStorage, useValue: new InMemoryObjectStorage() },
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

  const createTrip = async (name: string): Promise<{ id: string }> => {
    const created = await fetch(`${baseUrl}/trips`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rigId, name }),
    });
    expect(created.status).toBe(201);
    return (await created.json()) as { id: string };
  };

  it('creates a trip and lists it as a 200 JSON array with stops and status', async () => {
    const created = await fetch(`${baseUrl}/trips`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rigId,
        name: 'Fall colours loop',
        startLocation: 'Home driveway, Ottawa',
      }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as Record<string, unknown>;
    expect(createdBody).toMatchObject({
      name: 'Fall colours loop',
      startLocation: 'Home driveway, Ottawa',
      checklistIds: [],
      stops: [],
      status: 'planned',
    });

    const listed = await fetch(`${baseUrl}/trips?rigId=${rigId}`);
    expect(listed.status).toBe(200);
    const body: unknown = await listed.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Fall colours loop', rigId }),
      ]),
    );
  });

  it('creates a trip with its initial stops in one request and reads back the full plan (issue #120)', async () => {
    const created = await fetch(`${baseUrl}/trips`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        rigId,
        name: 'Maritimes run',
        startLocation: 'Home driveway, Ottawa',
        startPlaceId: 'ChIJHome123',
        stops: [
          { campground: 'KOA Kingston', legKm: 165 },
          { campground: 'Fundy National Park' },
        ],
      }),
    });
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      id: string;
      stops: Record<string, unknown>[];
    };
    expect(createdBody).toMatchObject({
      name: 'Maritimes run',
      startPlaceId: 'ChIJHome123',
      status: 'planned',
    });
    expect(createdBody.stops).toEqual([
      expect.objectContaining({
        campground: 'KOA Kingston',
        legKm: 165,
        position: 0,
        arrived: false,
      }),
      expect.objectContaining({
        campground: 'Fundy National Park',
        position: 1,
        arrived: false,
      }),
    ]);

    // The whole plan survives a fresh read — trip and stops landed together.
    const read = await fetch(`${baseUrl}/trips/${createdBody.id}`);
    expect(read.status).toBe(200);
    const readBody = (await read.json()) as { stops: unknown[] };
    expect(readBody).toMatchObject({ name: 'Maritimes run' });
    expect(readBody.stops).toHaveLength(2);
  });

  it('embeds a created stop on the trip read, flipping the status on arrival', async () => {
    const { id: tripId } = await createTrip('Eastbound');

    const stop = await fetch(`${baseUrl}/stops`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tripId, campground: 'KOA Kingston', legKm: 165 }),
    });
    expect(stop.status).toBe(201);
    const stopBody = (await stop.json()) as { id: string };

    const arrived = await fetch(`${baseUrl}/stops/${stopBody.id}/arrival`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ arrived: true }),
    });
    expect(arrived.status).toBe(200);

    const read = await fetch(`${baseUrl}/trips/${tripId}`);
    expect(read.status).toBe(200);
    const readBody = (await read.json()) as Record<string, unknown>;
    expect(readBody['status']).toBe('completed');
    expect(readBody['stops']).toEqual([
      expect.objectContaining({
        campground: 'KOA Kingston',
        legKm: 165,
        arrived: true,
        position: 0,
      }),
    ]);
  });

  it('patches a trip and clears the start point with null', async () => {
    const { id } = await createTrip('Draft');

    const patched = await fetch(`${baseUrl}/trips/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Named at last',
        startLocation: 'Ottawa',
      }),
    });
    expect(patched.status).toBe(200);

    const cleared = await fetch(`${baseUrl}/trips/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      // eslint-disable-next-line unicorn/no-null
      body: JSON.stringify({ startLocation: null }),
    });
    expect(cleared.status).toBe(200);
    const body = (await cleared.json()) as Record<string, unknown>;
    expect(body['name']).toBe('Named at last');
    expect(body['startLocation']).toBeUndefined();
  });

  it('rejects a blank trip name with 400', async () => {
    const created = await fetch(`${baseUrl}/trips`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rigId, name: '' }),
    });
    expect(created.status).toBe(400);
  });

  it('deletes a trip with 204 and 404s a later read', async () => {
    const { id } = await createTrip('Mistake');

    const deleted = await fetch(`${baseUrl}/trips/${id}`, {
      method: 'DELETE',
    });
    expect(deleted.status).toBe(204);

    const read = await fetch(`${baseUrl}/trips/${id}`);
    expect(read.status).toBe(404);
  });
});

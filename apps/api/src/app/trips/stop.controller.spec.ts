import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  AttachmentRepository,
  RigRepository,
  StopRepository,
  TripRepository,
} from '@rv-checklist/api-data-access';
import type { Owner, Rig, Trip } from '@rv-checklist/domain';
import {
  InMemoryAttachmentRepository,
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

/**
 * Exercises the stop HTTP surface through the *real* global
 * `ZodSerializerInterceptor` and `ZodValidationPipe`, exactly as
 * `app.module.ts` wires them — including the two explicit operations
 * (arrival, reorder) and the clear-vs-omit PATCH. The reorder route returns
 * an array, so it guards the `[Dto]` serializer wrapping too.
 */
describe('StopController over HTTP (through the Zod serializer)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let rigs: InMemoryRigRepository;

  beforeAll(async () => {
    rigs = new InMemoryRigRepository();
    await rigs.save(rig);
    const trips = new InMemoryTripRepository();
    await trips.save(trip);

    const moduleRef = await Test.createTestingModule({
      controllers: [StopController],
      providers: [
        StopService,
        { provide: StopRepository, useValue: new InMemoryStopRepository() },
        { provide: TripRepository, useValue: trips },
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

  const createStop = async (
    body: Record<string, unknown>,
  ): Promise<{ id: string; position: number }> => {
    const created = await fetch(`${baseUrl}/stops`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tripId, ...body }),
    });
    expect(created.status).toBe(201);
    return (await created.json()) as { id: string; position: number };
  };

  it('creates a stop with every detail field and round-trips it', async () => {
    const created = await fetch(`${baseUrl}/stops`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tripId,
        campground: 'Algonquin Lake of Two Rivers',
        placeId: 'ChIJStop456',
        campsite: 'B-42',
        arrivalDate: '2026-09-12',
        nights: 3,
        checkInTime: 'after 2pm',
        checkOutTime: '11:00',
        bookingNumber: 'ON-123456',
        costCents: 14_250,
        address: 'Hwy 60, Algonquin Park, ON',
        phone: '+1 705 555 0123',
        notes: 'gate code 4482',
        legKm: 245,
      }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      tripId,
      arrived: false,
      campground: 'Algonquin Lake of Two Rivers',
      campsite: 'B-42',
      arrivalDate: '2026-09-12',
      nights: 3,
      checkInTime: 'after 2pm',
      checkOutTime: '11:00',
      bookingNumber: 'ON-123456',
      costCents: 14_250,
      notes: 'gate code 4482',
      legKm: 245,
    });
  });

  it('patches detail fields and clears one with null', async () => {
    const { id } = await createStop({ campsite: 'B-42', nights: 3 });

    const patched = await fetch(`${baseUrl}/stops/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      // eslint-disable-next-line unicorn/no-null
      body: JSON.stringify({ campsite: null, nights: 4 }),
    });
    expect(patched.status).toBe(200);
    const body = (await patched.json()) as Record<string, unknown>;
    expect(body['campsite']).toBeUndefined();
    expect(body['nights']).toBe(4);
  });

  it('rejects a fractional legKm with 400 (whole kilometres only)', async () => {
    const { id } = await createStop({});

    const patched = await fetch(`${baseUrl}/stops/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ legKm: 12.5 }),
    });
    expect(patched.status).toBe(400);
  });

  it('arrives and un-arrives a stop through the arrival operation, moving the rig Distance', async () => {
    const { id } = await createStop({ legKm: 200 });
    const rigBefore = await rigs.findById(rigId);
    const before = rigBefore?.distanceKm ?? 0;

    const arrived = await fetch(`${baseUrl}/stops/${id}/arrival`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ arrived: true }),
    });
    expect(arrived.status).toBe(200);
    const arrivedBody = (await arrived.json()) as { arrived: boolean };
    expect(arrivedBody.arrived).toBe(true);
    const rigAfterArrival = await rigs.findById(rigId);
    expect(rigAfterArrival?.distanceKm).toBe(before + 200);

    const back = await fetch(`${baseUrl}/stops/${id}/arrival`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ arrived: false }),
    });
    expect(back.status).toBe(200);
    const rigAfterUnarrive = await rigs.findById(rigId);
    expect(rigAfterUnarrive?.distanceKm).toBe(before);
  });

  it('rejects an arrival body without the flag with 400', async () => {
    const { id } = await createStop({});

    const response = await fetch(`${baseUrl}/stops/${id}/arrival`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
  });

  it('reorders a stop and responds with the whole trip in the new order', async () => {
    const a = await createStop({ campground: 'First' });
    await createStop({ campground: 'Second' });

    const reordered = await fetch(`${baseUrl}/stops/${a.id}/reorder`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ position: 99 }),
    });
    expect(reordered.status).toBe(200);
    const body = (await reordered.json()) as { campground?: string }[];
    expect(body.at(-1)?.campground).toBe('First');
  });

  it('deletes a stop with 204', async () => {
    const { id } = await createStop({});

    const deleted = await fetch(`${baseUrl}/stops/${id}`, {
      method: 'DELETE',
    });
    expect(deleted.status).toBe(204);
  });
});

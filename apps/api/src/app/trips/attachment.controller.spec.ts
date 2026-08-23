import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  AttachmentRepository,
  RigRepository,
  StopRepository,
  TripRepository,
} from '@rv-checklist/api-data-access';
import type { Owner, Rig, StoredStop, Trip } from '@rv-checklist/domain';
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
import { AttachmentController } from './attachment.controller.js';
import { AttachmentService } from './attachment.service.js';

const owner: Owner = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'owner@example.com',
  name: undefined,
  picture: undefined,
};

const rigId = '550e8400-e29b-41d4-a716-446655440010';
const tripId = '550e8400-e29b-41d4-a716-446655440030';
const stopId = '550e8400-e29b-41d4-a716-446655440040';
const rig: Rig = { id: rigId, ownerId: owner.id, nickname: 'Silver Bullet' };
const trip: Trip = {
  id: tripId,
  rigId,
  name: 'Fall colours loop',
  checklistIds: [],
};
const stop: StoredStop = {
  id: stopId,
  tripId,
  rigId,
  position: 0,
  arrived: false,
};

/**
 * Exercises the attachment HTTP surface through the *real* global
 * `ZodSerializerInterceptor` and `ZodValidationPipe`, exactly as
 * `app.module.ts` wires them — multipart upload through the multer
 * interceptor (including its 15 MB cap), the streamed download with the
 * stored Content-Type, the campground-map flag, and the hard delete.
 */
describe('AttachmentController over HTTP (through the Zod serializer)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let storage: InMemoryObjectStorage;

  beforeAll(async () => {
    const rigs = new InMemoryRigRepository();
    await rigs.save(rig);
    const trips = new InMemoryTripRepository();
    await trips.save(trip);
    const stops = new InMemoryStopRepository();
    await stops.save(stop);
    storage = new InMemoryObjectStorage();

    const moduleRef = await Test.createTestingModule({
      controllers: [AttachmentController],
      providers: [
        AttachmentService,
        {
          provide: AttachmentRepository,
          useValue: new InMemoryAttachmentRepository(),
        },
        { provide: StopRepository, useValue: stops },
        { provide: TripRepository, useValue: trips },
        { provide: RigRepository, useValue: rigs },
        { provide: ObjectStorage, useValue: storage },
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

  const upload = async (
    bytes: Buffer | string,
    type = 'image/png',
    filename = 'site-map.png',
  ): Promise<Response> => {
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), filename);
    return fetch(`${baseUrl}/stops/${stopId}/attachments`, {
      method: 'POST',
      body: form,
    });
  };

  it('uploads a file and responds with the metadata row', async () => {
    const response = await upload('png bytes');

    expect(response.status).toBe(201);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      stopId,
      filename: 'site-map.png',
      mimeType: 'image/png',
      sizeBytes: 9,
      isCampgroundMap: false,
    });
    // The denormalized rig_id (ADR-0028) is sync plumbing — the serializer
    // must keep it off the wire.
    expect(body).not.toHaveProperty('rigId');
  });

  it('rejects a request without a "file" field with 400', async () => {
    const form = new FormData();
    const response = await fetch(`${baseUrl}/stops/${stopId}/attachments`, {
      method: 'POST',
      body: form,
    });
    expect(response.status).toBe(400);
  });

  it('rejects an unsupported type with 400', async () => {
    const response = await upload('plain text', 'text/plain', 'notes.txt');
    expect(response.status).toBe(400);
  });

  it('caps the upload at 15 MB in the multer interceptor (413)', async () => {
    const response = await upload(Buffer.alloc(15 * 1024 * 1024 + 1));
    expect(response.status).toBe(413);
  });

  it('streams the original back with the stored Content-Type and filename', async () => {
    const uploadResponse = await upload('map bytes');
    const uploaded = (await uploadResponse.json()) as { id: string };

    const response = await fetch(`${baseUrl}/attachments/${uploaded.id}`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-disposition')).toContain(
      'filename="site-map.png"',
    );
    expect(await response.text()).toBe('map bytes');
  });

  it('flags the campground map, swapping it off the previous one', async () => {
    const firstResponse = await upload('a');
    const first = (await firstResponse.json()) as { id: string };
    const secondResponse = await upload('b');
    const second = (await secondResponse.json()) as { id: string };
    const flag = (id: string, isCampgroundMap: boolean) =>
      fetch(`${baseUrl}/attachments/${id}/campground-map`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isCampgroundMap }),
      });

    await flag(first.id, true);
    const swapped = await flag(second.id, true);

    expect(swapped.status).toBe(200);
    const swappedBody = (await swapped.json()) as Record<string, unknown>;
    expect(swappedBody['isCampgroundMap']).toBe(true);
    // The first is still downloadable, just unflagged.
    const firstDownload = await fetch(`${baseUrl}/attachments/${first.id}`);
    expect(firstDownload.status).toBe(200);
  });

  it('deletes an attachment with 204 and removes its object', async () => {
    const uploadResponse = await upload('gone');
    const uploaded = (await uploadResponse.json()) as { id: string };
    const key = `stops/${stopId}/${uploaded.id}`;
    expect(storage.keys()).toContain(key);

    const response = await fetch(`${baseUrl}/attachments/${uploaded.id}`, {
      method: 'DELETE',
    });

    expect(response.status).toBe(204);
    expect(storage.keys()).not.toContain(key);
    const downloadAfter = await fetch(`${baseUrl}/attachments/${uploaded.id}`);
    expect(downloadAfter.status).toBe(404);
  });
});

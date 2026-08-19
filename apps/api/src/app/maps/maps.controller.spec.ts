import { type ExecutionContext, type INestApplication } from '@nestjs/common';
import { APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { Owner } from '@rv-checklist/domain';
import { ZodSerializerInterceptor, ZodValidationPipe } from 'nestjs-zod';
import { JwtAuthGuard } from '../auth/guards.js';
import {
  GoogleMapsClient,
  type GoogleMapsReply,
} from './google-maps.client.js';
import { MapsController } from './maps.controller.js';
import { MapsService } from './maps.service.js';

const owner: Owner = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  email: 'owner@example.com',
  name: undefined,
  picture: undefined,
};

/** Plays back one queued Google reply per call — no HTTP leaves the test. */
class FakeGoogleMapsClient extends GoogleMapsClient {
  private readonly replies: GoogleMapsReply[] = [];

  reply(status: number, body: unknown): void {
    this.replies.push({ status, body });
  }

  call(): Promise<GoogleMapsReply> {
    const next = this.replies.shift();
    return next === undefined
      ? Promise.reject(new Error('no reply queued'))
      : Promise.resolve(next);
  }
}

describe('MapsController over HTTP (through the Zod serializer)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let google: FakeGoogleMapsClient;

  beforeAll(async () => {
    google = new FakeGoogleMapsClient();

    const moduleRef = await Test.createTestingModule({
      controllers: [MapsController],
      providers: [
        MapsService,
        { provide: GoogleMapsClient, useValue: google },
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

  it('serves autocomplete suggestions as a 200 JSON array', async () => {
    google.reply(200, {
      suggestions: [
        {
          placePrediction: {
            placeId: 'ChIJa',
            text: { text: 'McRae Point Provincial Park' },
          },
        },
      ],
    });

    const response = await fetch(`${baseUrl}/maps/autocomplete?input=mcrae`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { placeId: 'ChIJa', description: 'McRae Point Provincial Park' },
    ]);
  });

  it('rejects an autocomplete without input as 400', async () => {
    const response = await fetch(`${baseUrl}/maps/autocomplete`);

    expect(response.status).toBe(400);
  });

  it('serves place details', async () => {
    google.reply(200, {
      formattedAddress: '123 Main St, Orillia, ON',
      nationalPhoneNumber: '(705) 555-0123',
    });

    const response = await fetch(`${baseUrl}/maps/places/ChIJa`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      address: '123 Main St, Orillia, ON',
      phone: '(705) 555-0123',
    });
  });

  it('surfaces an unknown place as 404', async () => {
    google.reply(404, { error: { status: 'NOT_FOUND' } });

    const response = await fetch(`${baseUrl}/maps/places/ChIJnope`);

    expect(response.status).toBe(404);
  });

  it('computes a rounded route distance as a 200', async () => {
    google.reply(200, { routes: [{ distanceMeters: 123_456 }] });

    const response = await fetch(`${baseUrl}/maps/route-distance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        originPlaceId: 'ChIJorigin',
        destinationPlaceId: 'ChIJdestination',
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ legKm: 125 });
  });

  it('rejects a route-distance body missing a place ID as 400', async () => {
    const response = await fetch(`${baseUrl}/maps/route-distance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ originPlaceId: 'ChIJorigin' }),
    });

    expect(response.status).toBe(400);
  });

  it('surfaces an upstream failure as 502', async () => {
    google.reply(500, undefined);

    const response = await fetch(`${baseUrl}/maps/route-distance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        originPlaceId: 'ChIJorigin',
        destinationPlaceId: 'ChIJdestination',
      }),
    });

    expect(response.status).toBe(502);
  });
});

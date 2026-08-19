import { BadGatewayException, NotFoundException } from '@nestjs/common';
import {
  GoogleMapsClient,
  type GoogleMapsReply,
} from './google-maps.client.js';
import { MapsService } from './maps.service.js';

/** Records every outbound call and plays back queued replies — no HTTP. */
class FakeGoogleMapsClient extends GoogleMapsClient {
  private readonly replies: (GoogleMapsReply | Error)[] = [];
  readonly calls: { url: string; fieldMask: string; body?: unknown }[] = [];

  reply(status: number, body: unknown): this {
    this.replies.push({ status, body });
    return this;
  }

  fail(error: Error): this {
    this.replies.push(error);
    return this;
  }

  call(
    url: string,
    fieldMask: string,
    body?: unknown,
  ): Promise<GoogleMapsReply> {
    this.calls.push({ url, fieldMask, body });
    const next = this.replies.shift();
    if (next === undefined) {
      return Promise.reject(new Error('no reply queued'));
    }
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  }
}

function makeService(): { service: MapsService; google: FakeGoogleMapsClient } {
  const google = new FakeGoogleMapsClient();
  return { service: new MapsService(google), google };
}

const suggestion = (placeId: string, text: string) => ({
  placePrediction: { placeId, text: { text } },
});

describe('MapsService', () => {
  describe('autocomplete', () => {
    it('maps Google suggestions to placeId/description pairs', async () => {
      const { service, google } = makeService();
      google.reply(200, {
        suggestions: [
          suggestion('ChIJa', 'McRae Point Provincial Park, Ramara, ON'),
          suggestion('ChIJb', 'McRae Beach, Georgina, ON'),
        ],
      });

      await expect(service.autocomplete('mcrae')).resolves.toEqual([
        {
          placeId: 'ChIJa',
          description: 'McRae Point Provincial Park, Ramara, ON',
        },
        { placeId: 'ChIJb', description: 'McRae Beach, Georgina, ON' },
      ]);
    });

    it('sends one field-masked POST with the input', async () => {
      const { service, google } = makeService();
      google.reply(200, {});

      await service.autocomplete('mcrae');

      expect(google.calls).toEqual([
        {
          url: 'https://places.googleapis.com/v1/places:autocomplete',
          fieldMask:
            'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
          body: { input: 'mcrae' },
        },
      ]);
    });

    it('returns [] when Google has no suggestions', async () => {
      const { service, google } = makeService();
      google.reply(200, {});

      await expect(service.autocomplete('zzzzz')).resolves.toEqual([]);
    });

    it('throws 502 when Google errors', async () => {
      const { service, google } = makeService();
      google.reply(500, { error: { message: 'boom' } });

      await expect(service.autocomplete('mcrae')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it('throws 502 when Google is unreachable', async () => {
      const { service, google } = makeService();
      google.fail(new TypeError('fetch failed'));

      await expect(service.autocomplete('mcrae')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  describe('placeDetails', () => {
    it('returns address and phone from one field-masked call', async () => {
      const { service, google } = makeService();
      google.reply(200, {
        formattedAddress: '123 Main St, Orillia, ON L3V 6H1, Canada',
        nationalPhoneNumber: '(705) 555-0123',
      });

      await expect(service.placeDetails('ChIJa')).resolves.toEqual({
        address: '123 Main St, Orillia, ON L3V 6H1, Canada',
        phone: '(705) 555-0123',
      });

      // One combined call, never two — the phone field bills the Enterprise
      // SKU and the key's Place Details quota is 30/day (#109).
      expect(google.calls).toEqual([
        {
          url: 'https://places.googleapis.com/v1/places/ChIJa',
          fieldMask: 'formattedAddress,nationalPhoneNumber',
          body: undefined,
        },
      ]);
    });

    it('omits fields the place does not have', async () => {
      const { service, google } = makeService();
      google.reply(200, { formattedAddress: 'Somewhere, ON, Canada' });

      await expect(service.placeDetails('ChIJa')).resolves.toEqual({
        address: 'Somewhere, ON, Canada',
        phone: undefined,
      });
    });

    it('throws 404 for an unknown place ID', async () => {
      const { service, google } = makeService();
      google.reply(404, { error: { status: 'NOT_FOUND' } });

      await expect(service.placeDetails('ChIJnope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 for a malformed place ID', async () => {
      const { service, google } = makeService();
      google.reply(400, { error: { status: 'INVALID_ARGUMENT' } });

      await expect(service.placeDetails('not-a-place')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 502 when Google errors', async () => {
      const { service, google } = makeService();
      google.reply(503, undefined);

      await expect(service.placeDetails('ChIJa')).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });
  });

  describe('routeDistance', () => {
    it('converts distanceMeters to km rounded to the nearest 5', async () => {
      const { service, google } = makeService();
      google.reply(200, { routes: [{ distanceMeters: 123_456 }] });

      await expect(
        service.routeDistance('ChIJorigin', 'ChIJdestination'),
      ).resolves.toEqual({ legKm: 125 });
    });

    it('sends one field-masked driving computeRoutes call', async () => {
      const { service, google } = makeService();
      google.reply(200, { routes: [{ distanceMeters: 10_000 }] });

      await service.routeDistance('ChIJorigin', 'ChIJdestination');

      expect(google.calls).toEqual([
        {
          url: 'https://routes.googleapis.com/directions/v2:computeRoutes',
          fieldMask: 'routes.distanceMeters',
          body: {
            origin: { placeId: 'ChIJorigin' },
            destination: { placeId: 'ChIJdestination' },
            travelMode: 'DRIVE',
          },
        },
      ]);
    });

    it('treats an omitted distanceMeters as zero (proto3 zero-elision)', async () => {
      const { service, google } = makeService();
      google.reply(200, { routes: [{}] });

      await expect(
        service.routeDistance('ChIJhere', 'ChIJhere'),
      ).resolves.toEqual({ legKm: 0 });
    });

    it('throws 404 when no route exists between the places', async () => {
      const { service, google } = makeService();
      google.reply(200, {});

      await expect(
        service.routeDistance('ChIJmainland', 'ChIJisland'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 404 for an unknown place ID', async () => {
      const { service, google } = makeService();
      google.reply(400, { error: { status: 'INVALID_ARGUMENT' } });

      await expect(
        service.routeDistance('ChIJnope', 'ChIJdestination'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws 502 when Google errors', async () => {
      const { service, google } = makeService();
      google.reply(500, undefined);

      await expect(
        service.routeDistance('ChIJorigin', 'ChIJdestination'),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });

    it('throws 502 when Google is unreachable', async () => {
      const { service, google } = makeService();
      google.fail(new TypeError('fetch failed'));

      await expect(
        service.routeDistance('ChIJorigin', 'ChIJdestination'),
      ).rejects.toBeInstanceOf(BadGatewayException);
    });
  });
});

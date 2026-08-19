import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  legKmFromMeters,
  type PlaceDetails,
  type PlaceSuggestion,
  type RouteDistance,
} from '@rv-checklist/domain';
import { z } from 'zod';
import {
  GoogleMapsClient,
  type GoogleMapsReply,
} from './google-maps.client.js';

const PLACES_BASE_URL = 'https://places.googleapis.com/v1';
const COMPUTE_ROUTES_URL =
  'https://routes.googleapis.com/directions/v2:computeRoutes';

// Loose readers for the slices of Google's replies the field masks request.
// Anything outside these shapes means Google changed under us — a 502, not a
// validation error blamed on the caller.
const GooglePlacePredictionSchema = z.object({
  placeId: z.string(),
  text: z.object({ text: z.string() }),
});

const GoogleSuggestionSchema = z.object({
  placePrediction: GooglePlacePredictionSchema.optional(),
});

const GoogleSuggestionsSchema = z.object({
  suggestions: z.array(GoogleSuggestionSchema).optional(),
});

const GooglePlaceSchema = z.object({
  formattedAddress: z.string().optional(),
  nationalPhoneNumber: z.string().optional(),
});

// Routes API elides proto3 zero values, so a zero-length route has no
// distanceMeters at all.
const GoogleRouteSchema = z.object({ distanceMeters: z.number().optional() });

const GoogleRoutesSchema = z.object({
  routes: z.array(GoogleRouteSchema).optional(),
});

/**
 * Google Maps proxy use-cases (issue #112, ADR-0025). Three read-only calls —
 * autocomplete, place details, route distance — behind the injectable
 * {@link GoogleMapsClient} seam. Nothing that comes back is persisted: the
 * results only pre-fill editable fields client-side, and the route distance
 * is coarsened to the nearest 5 km before it leaves the server so no raw
 * Google figure reaches the client.
 *
 * Error mapping: an unreachable or misbehaving Google is a 502; an unknown
 * place ID or a leg with no drivable route is a 404. Google reports an
 * unknown/malformed place ID as a 400 INVALID_ARGUMENT, so upstream 400s map
 * to 404 too — the caller's place ID is the only input we forward.
 */
@Injectable()
export class MapsService {
  constructor(private readonly google: GoogleMapsClient) {}

  private async callGoogle(
    url: string,
    fieldMask: string,
    body?: unknown,
  ): Promise<GoogleMapsReply> {
    try {
      return await this.google.call(url, fieldMask, body);
    } catch {
      throw new BadGatewayException('Google Maps is unreachable');
    }
  }

  private parseReply<T>(schema: z.ZodType<T>, body: unknown): T {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new BadGatewayException('Unexpected Google Maps response');
    }
    return parsed.data;
  }

  /** Search places by free text — Places API (New) Autocomplete. */
  async autocomplete(input: string): Promise<PlaceSuggestion[]> {
    const reply = await this.callGoogle(
      `${PLACES_BASE_URL}/places:autocomplete`,
      'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
      { input },
    );
    if (reply.status !== 200) {
      throw new BadGatewayException('Google Maps autocomplete failed');
    }
    const data = this.parseReply(GoogleSuggestionsSchema, reply.body);
    return (data.suggestions ?? []).flatMap((s) =>
      s.placePrediction
        ? [
            {
              placeId: s.placePrediction.placeId,
              description: s.placePrediction.text.text,
            },
          ]
        : [],
    );
  }

  /**
   * Address and phone for one place — Place Details (New). One combined
   * field-masked call, never two: the phone field bills the Enterprise SKU
   * and the key's Place Details quota is capped at 30/day (#109).
   */
  async placeDetails(placeId: string): Promise<PlaceDetails> {
    const reply = await this.callGoogle(
      `${PLACES_BASE_URL}/places/${encodeURIComponent(placeId)}`,
      'formattedAddress,nationalPhoneNumber',
    );
    if (reply.status === 400 || reply.status === 404) {
      throw new NotFoundException('Place not found');
    }
    if (reply.status !== 200) {
      throw new BadGatewayException('Google Maps place details failed');
    }
    const data = this.parseReply(GooglePlaceSchema, reply.body);
    return { address: data.formattedAddress, phone: data.nationalPhoneNumber };
  }

  /** Driving distance between two places — Routes API `computeRoutes`. */
  async routeDistance(
    originPlaceId: string,
    destinationPlaceId: string,
  ): Promise<RouteDistance> {
    const reply = await this.callGoogle(
      COMPUTE_ROUTES_URL,
      'routes.distanceMeters',
      {
        origin: { placeId: originPlaceId },
        destination: { placeId: destinationPlaceId },
        travelMode: 'DRIVE',
      },
    );
    if (reply.status === 400 || reply.status === 404) {
      throw new NotFoundException('Place not found');
    }
    if (reply.status !== 200) {
      throw new BadGatewayException('Google Maps route computation failed');
    }
    const data = this.parseReply(GoogleRoutesSchema, reply.body);
    const route = data.routes?.[0];
    if (route === undefined) {
      throw new NotFoundException('No route found');
    }
    return { legKm: legKmFromMeters(route.distanceMeters ?? 0) };
  }
}

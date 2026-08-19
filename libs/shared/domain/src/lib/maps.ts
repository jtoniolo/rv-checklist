import { z } from 'zod';

/**
 * Maps proxy shapes (issue #112, ADR-0025). The API proxies Google Maps
 * server-side; responses only ever *pre-fill* editable fields client-side and
 * are never persisted. Only a place ID may be stored (the terms permit that
 * indefinitely) — it travels inside request bodies here, never as saved
 * Google content.
 */

/** One autocomplete hit — a Google place ID plus its display text. */
export const PlaceSuggestionSchema = z.object({
  placeId: z.string().min(1),
  description: z.string().min(1),
});
export type PlaceSuggestion = z.infer<typeof PlaceSuggestionSchema>;

/**
 * Place Details pre-fill payload — formatted address and national phone
 * number, both optional (Google omits fields a place does not have).
 */
export const PlaceDetailsSchema = z.object({
  address: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
});
export type PlaceDetails = z.infer<typeof PlaceDetailsSchema>;

/** `POST /maps/route-distance` body — place IDs on both ends of the leg. */
export const RouteDistanceRequestSchema = z.object({
  originPlaceId: z.string().min(1),
  destinationPlaceId: z.string().min(1),
});
export type RouteDistanceRequest = z.infer<typeof RouteDistanceRequestSchema>;

/**
 * A fetched leg distance. Whole kilometres, always a multiple of 5: the
 * server coarsens Google's `distanceMeters` (ADR-0025) so no raw Google
 * figure ever reaches the client.
 */
export const RouteDistanceSchema = z.object({
  legKm: z.number().int().nonnegative().multipleOf(5),
});
export type RouteDistance = z.infer<typeof RouteDistanceSchema>;

/**
 * Coarsen a Google `distanceMeters` to the leg's km figure — rounded to the
 * nearest 5 km (ADR-0025). Distance is an owner-maintained estimate; the
 * rounded figure is honestly theirs, not a stored Google datum.
 */
export function legKmFromMeters(distanceMeters: number): number {
  return Math.round(distanceMeters / 5000) * 5;
}

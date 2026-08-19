import {
  PlaceDetailsSchema,
  PlaceSuggestionSchema,
  RouteDistanceRequestSchema,
  RouteDistanceSchema,
} from '@rv-checklist/domain';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/** `GET /maps/autocomplete` query — a non-empty search string. */
export class AutocompleteQueryDto extends createZodDto(
  z.object({ input: z.string().min(1) }),
) {}

/** One element of the autocomplete response array. */
export class PlaceSuggestionDto extends createZodDto(PlaceSuggestionSchema) {}

/** `GET /maps/places/:placeId` response. */
export class PlaceDetailsDto extends createZodDto(PlaceDetailsSchema) {}

/** `POST /maps/route-distance` body — place IDs on both ends of the leg. */
export class RouteDistanceRequestDto extends createZodDto(
  RouteDistanceRequestSchema,
) {}

/** `POST /maps/route-distance` response — whole km, multiple of 5. */
export class RouteDistanceDto extends createZodDto(RouteDistanceSchema) {}

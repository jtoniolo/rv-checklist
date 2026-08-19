import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type {
  PlaceDetails,
  PlaceSuggestion,
  RouteDistance,
} from '@rv-checklist/domain';
import { ZodSerializerDto } from 'nestjs-zod';
import { JwtAuthGuard } from '../auth/guards.js';
import {
  AutocompleteQueryDto,
  PlaceDetailsDto,
  PlaceSuggestionDto,
  RouteDistanceDto,
  RouteDistanceRequestDto,
} from './maps.dto.js';
import { MapsService } from './maps.service.js';

/**
 * Google Maps proxy endpoints (issue #112, ADR-0025). Every route is behind
 * the JWT guard: the proxy spends the server's API key, so only the
 * authenticated owner may trigger a call. Nothing here touches the database —
 * the responses only pre-fill editable fields client-side.
 */
@UseGuards(JwtAuthGuard)
@Controller('maps')
export class MapsController {
  constructor(private readonly maps: MapsService) {}

  /** Search places by free text. */
  @Get('autocomplete')
  // Array response: the DTO must be wrapped as `[Dto]` so the serializer
  // validates each element (see RigController).
  @ZodSerializerDto([PlaceSuggestionDto])
  autocomplete(
    @Query() query: AutocompleteQueryDto,
  ): Promise<PlaceSuggestion[]> {
    return this.maps.autocomplete(query.input);
  }

  /** Address and phone for one place, from a single field-masked call. */
  @Get('places/:placeId')
  @ZodSerializerDto(PlaceDetailsDto)
  placeDetails(@Param('placeId') placeId: string): Promise<PlaceDetails> {
    return this.maps.placeDetails(placeId);
  }

  /**
   * Driving distance between two places, rounded to the nearest 5 km
   * server-side. POST because the place IDs travel in a body, but it computes
   * rather than creates — hence 200, not 201.
   */
  @Post('route-distance')
  @HttpCode(200)
  @ZodSerializerDto(RouteDistanceDto)
  routeDistance(@Body() body: RouteDistanceRequestDto): Promise<RouteDistance> {
    return this.maps.routeDistance(body.originPlaceId, body.destinationPlaceId);
  }
}

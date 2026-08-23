import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Owner, TripRead } from '@rv-checklist/domain';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentOwner } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards.js';
import { EditedAt } from '../common/edited-at.decorator.js';
import { TripService } from './trip.service.js';
import { CreateTripDto, TripDto, UpdateTripDto } from './trips.dto.js';

/**
 * Trip endpoints (issue #111). Every route is behind the JWT guard and scoped
 * to the authenticated owner (ADR-0003): the handler only ever passes
 * `owner.id` to the use-case, which resolves ownership via the trip's rig.
 * Every response is the read shape — stops embedded in travel order, status
 * derived — validated/serialised to {@link TripDto}.
 */
@UseGuards(JwtAuthGuard)
@Controller('trips')
export class TripController {
  constructor(private readonly trips: TripService) {}

  @Post()
  @ZodSerializerDto(TripDto)
  create(
    @CurrentOwner() owner: Owner,
    @Body() body: CreateTripDto,
  ): Promise<TripRead> {
    return this.trips.create(owner.id, body);
  }

  /** The trips of one rig — the only list scope a trip screen needs. */
  @Get()
  // Array response: the DTO must be wrapped as `[Dto]` so the serializer
  // validates each element against TripReadSchema (see RigController).
  @ZodSerializerDto([TripDto])
  list(
    @CurrentOwner() owner: Owner,
    @Query('rigId', ParseUUIDPipe) rigId: string,
  ): Promise<TripRead[]> {
    return this.trips.list(owner.id, rigId);
  }

  @Get(':id')
  @ZodSerializerDto(TripDto)
  get(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<TripRead> {
    return this.trips.get(owner.id, id);
  }

  /** Edit the trip itself — name, start point, linked checklists. Stops have their own routes. */
  @Patch(':id')
  @ZodSerializerDto(TripDto)
  update(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateTripDto,
    @EditedAt() editedAt?: Date,
  ): Promise<TripRead> {
    return this.trips.update(owner.id, id, body, editedAt);
  }

  /** Delete a trip — its stops go with it; its runs are unlinked, never deleted. */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.trips.remove(owner.id, id);
  }
}

import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Owner, StopRead } from '@rv-checklist/domain';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentOwner } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards.js';
import { EditedAt } from '../common/edited-at.decorator.js';
import { StopService } from './stop.service.js';
import {
  CreateStopDto,
  ReorderStopDto,
  SetStopArrivedDto,
  StopDto,
  UpdateStopDto,
} from './trips.dto.js';

/**
 * Stop endpoints (issue #111). Every route is behind the JWT guard and scoped
 * to the authenticated owner (ADR-0003) via the stop's trip's rig. There is no
 * list route — a trip read embeds its stops in travel order. Arrival and
 * reorder are explicit operations, not PATCH fields: arrival carries the
 * rig-Distance side effects and reorder renumbers the whole trip.
 */
@UseGuards(JwtAuthGuard)
@Controller('stops')
export class StopController {
  constructor(private readonly stops: StopService) {}

  /**
   * Append a stop at the end of one of the owner's trips. `X-Edited-At`
   * initialises the new row's LWW edit time (issue #143), so a create replayed
   * at reconnect never stamps itself later than the edits already queued behind
   * it.
   */
  @Post()
  @ZodSerializerDto(StopDto)
  create(
    @CurrentOwner() owner: Owner,
    @Body() body: CreateStopDto,
    @EditedAt() editedAt?: Date,
  ): Promise<StopRead> {
    return this.stops.create(owner.id, body, editedAt);
  }

  /** Edit a stop's detail fields (`null` clears one). */
  @Patch(':id')
  @ZodSerializerDto(StopDto)
  update(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStopDto,
    @EditedAt() editedAt?: Date,
  ): Promise<StopRead> {
    return this.stops.update(owner.id, id, body, editedAt);
  }

  /**
   * Arrive (or un-arrive) a stop — the operation that maintains the rig's
   * Distance. A delta operation, so it is exempt from the LWW gate and always
   * applies; `X-Edited-At` still sets the stamp it leaves on the stop and the
   * rig, to max(stored, clamped) (issue #143).
   */
  @Post(':id/arrival')
  @HttpCode(200)
  @ZodSerializerDto(StopDto)
  setArrived(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetStopArrivedDto,
    @EditedAt() editedAt?: Date,
  ): Promise<StopRead> {
    return this.stops.setArrived(owner.id, id, body.arrived, editedAt);
  }

  /**
   * Move a stop to a new position; responds with the trip's stops in their new
   * order. Exempt from the LWW gate like arrival, and stamped the same way
   * (issue #143).
   */
  @Post(':id/reorder')
  @HttpCode(200)
  // Array response: wrapped as `[Dto]` so each element is validated (see RigController).
  @ZodSerializerDto([StopDto])
  reorder(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReorderStopDto,
    @EditedAt() editedAt?: Date,
  ): Promise<StopRead[]> {
    return this.stops.reorder(owner.id, id, body, editedAt);
  }

  /** Delete a stop (an arrived one backs its leg out of the rig's Distance). */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.stops.remove(owner.id, id);
  }
}

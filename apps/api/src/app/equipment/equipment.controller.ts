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
import type { EquipmentItem, Owner } from '@rv-checklist/domain';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentOwner } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards.js';
import { EditedAt } from '../common/edited-at.decorator.js';
import {
  CreateEquipmentItemDto,
  EquipmentItemDto,
  UpdateEquipmentItemDto,
} from './equipment.dto.js';
import { EquipmentService } from './equipment.service.js';

/**
 * Equipment endpoints (issue #79). Every route is behind the JWT guard and
 * scoped to the authenticated owner (ADR-0003): the handler only ever passes
 * `owner.id` to the use-case, which resolves ownership via the item's rig.
 */
@UseGuards(JwtAuthGuard)
@Controller('equipment')
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  /**
   * `X-Edited-At` initialises the new row's LWW edit time (issue #143), so a
   * create replayed at reconnect never stamps itself later than the edits
   * already queued behind it.
   */
  @Post()
  @ZodSerializerDto(EquipmentItemDto)
  create(
    @CurrentOwner() owner: Owner,
    @Body() body: CreateEquipmentItemDto,
    @EditedAt() editedAt?: Date,
  ): Promise<EquipmentItem> {
    return this.equipment.create(owner.id, body, editedAt);
  }

  @Get()
  @ZodSerializerDto([EquipmentItemDto])
  list(
    @CurrentOwner() owner: Owner,
    @Query('rigId', ParseUUIDPipe) rigId: string,
  ): Promise<EquipmentItem[]> {
    return this.equipment.list(owner.id, rigId);
  }

  @Patch(':id')
  @ZodSerializerDto(EquipmentItemDto)
  update(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateEquipmentItemDto,
    @EditedAt() editedAt?: Date,
  ): Promise<EquipmentItem> {
    return this.equipment.update(owner.id, id, body, editedAt);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.equipment.remove(owner.id, id);
  }
}

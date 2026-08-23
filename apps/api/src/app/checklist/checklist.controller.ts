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
import type { Checklist, Owner } from '@rv-checklist/domain';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentOwner } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards.js';
import { EditedAt } from '../common/edited-at.decorator.js';
import {
  ChecklistDto,
  CreateChecklistDto,
  UpdateChecklistDto,
} from './checklist.dto.js';
import { ChecklistService } from './checklist.service.js';

/**
 * Checklist endpoints (issue #15 — T5 authoring). Every route is behind the JWT
 * guard and scoped to the authenticated owner (ADR-0003): the handler only ever
 * passes `owner.id` to the use-case, which resolves ownership via the
 * checklist's rig, so a caller can act on their own rigs' checklists and no
 * others. A checklist's whole `steps` array travels on create and on PATCH, so
 * add / edit / reorder / delete of steps are all one write — no separate step
 * endpoints. Bodies are validated by the shared Zod schemas via the global
 * `ZodValidationPipe`; responses are validated/serialised to {@link ChecklistDto}.
 */
@UseGuards(JwtAuthGuard)
@Controller('checklists')
export class ChecklistController {
  constructor(private readonly checklists: ChecklistService) {}

  /** Add a checklist to one of the owner's rigs. */
  @Post()
  @ZodSerializerDto(ChecklistDto)
  create(
    @CurrentOwner() owner: Owner,
    @Body() body: CreateChecklistDto,
  ): Promise<Checklist> {
    return this.checklists.create(owner.id, body);
  }

  /** List the checklists of one of the owner's rigs (`?rigId=`). */
  @Get()
  // Array response: the DTO must be wrapped as `[Dto]` so the serializer
  // validates each element against ChecklistSchema (see RigController).
  @ZodSerializerDto([ChecklistDto])
  list(
    @CurrentOwner() owner: Owner,
    @Query('rigId', ParseUUIDPipe) rigId: string,
  ): Promise<Checklist[]> {
    return this.checklists.list(owner.id, rigId);
  }

  /** Read one of the owner's checklists. */
  @Get(':id')
  @ZodSerializerDto(ChecklistDto)
  get(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Checklist> {
    return this.checklists.get(owner.id, id);
  }

  /** Edit one of the owner's checklists (name, tags, and/or the whole steps array). */
  @Patch(':id')
  @ZodSerializerDto(ChecklistDto)
  update(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateChecklistDto,
    @EditedAt() editedAt?: Date,
  ): Promise<Checklist> {
    return this.checklists.update(owner.id, id, body, editedAt);
  }

  /** Delete one of the owner's checklists. */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.checklists.remove(owner.id, id);
  }
}

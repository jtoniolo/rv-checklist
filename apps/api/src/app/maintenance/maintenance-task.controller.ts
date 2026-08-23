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
import type { MaintenanceTask, Owner } from '@rv-checklist/domain';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentOwner } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards.js';
import { EditedAt } from '../common/edited-at.decorator.js';
import { MaintenanceTaskService } from './maintenance-task.service.js';
import {
  CreateMaintenanceTaskDto,
  MaintenanceTaskDto,
  UpdateMaintenanceTaskDto,
} from './maintenance.dto.js';

/**
 * Maintenance-task endpoints (issue #17). Every route is behind the JWT guard
 * and scoped to the authenticated owner (ADR-0003): the handler only ever
 * passes `owner.id` to the use-case, which resolves ownership via the task's
 * (or target) rig, so a caller can act on their own rigs' tasks and no others.
 * Bodies are validated by the shared Zod schemas via the global
 * `ZodValidationPipe` — including the ADR-0004 field rules (`photo` rejected,
 * names unique within the task); responses are validated/serialised to
 * {@link MaintenanceTaskDto}.
 */
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class MaintenanceTaskController {
  constructor(private readonly tasks: MaintenanceTaskService) {}

  /**
   * Create a task on one of the owner's rigs. `X-Edited-At` initialises the new
   * row's LWW edit time (issue #143), so a create replayed at reconnect never
   * stamps itself later than the edits already queued behind it.
   */
  @Post()
  @ZodSerializerDto(MaintenanceTaskDto)
  create(
    @CurrentOwner() owner: Owner,
    @Body() body: CreateMaintenanceTaskDto,
    @EditedAt() editedAt?: Date,
  ): Promise<MaintenanceTask> {
    return this.tasks.create(owner.id, body, editedAt);
  }

  /** List a rig's tasks — the maintenance screen's read. */
  @Get()
  // Array response: the DTO must be wrapped as `[Dto]` so the serializer
  // validates each element against MaintenanceTaskSchema (see RigController).
  @ZodSerializerDto([MaintenanceTaskDto])
  list(
    @CurrentOwner() owner: Owner,
    @Query('rigId', ParseUUIDPipe) rigId: string,
  ): Promise<MaintenanceTask[]> {
    return this.tasks.listByRig(owner.id, rigId);
  }

  /** Read one of the owner's tasks. */
  @Get(':id')
  @ZodSerializerDto(MaintenanceTaskDto)
  get(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MaintenanceTask> {
    return this.tasks.get(owner.id, id);
  }

  /** Edit one of the owner's tasks (name, interval, and/or fields). */
  @Patch(':id')
  @ZodSerializerDto(MaintenanceTaskDto)
  update(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateMaintenanceTaskDto,
    @EditedAt() editedAt?: Date,
  ): Promise<MaintenanceTask> {
    return this.tasks.update(owner.id, id, body, editedAt);
  }

  /** Delete one of the owner's tasks. */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.tasks.remove(owner.id, id);
  }
}

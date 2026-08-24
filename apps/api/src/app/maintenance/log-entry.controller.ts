import {
  BadRequestException,
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
import type { LogEntry, Owner } from '@rv-checklist/domain';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentOwner } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards.js';
import { EditedAt } from '../common/edited-at.decorator.js';
import { LogEntryService } from './log-entry.service.js';
import {
  CreateLogEntryDto,
  LogEntryDto,
  UpdateLogEntryDto,
} from './maintenance.dto.js';

/**
 * Log-entry endpoints (issue #17). Every route is behind the JWT guard and
 * scoped to the authenticated owner (ADR-0003): the handler only ever passes
 * `owner.id` to the use-case, which resolves ownership via the entry's (or
 * task's) rig. Bodies are validated by the shared Zod schemas via the global
 * `ZodValidationPipe` — the snapshot fields carry the same ADR-0004 rules as a
 * live field schema; responses are validated/serialised to {@link LogEntryDto}.
 */
@UseGuards(JwtAuthGuard)
@Controller('log-entries')
export class LogEntryController {
  constructor(private readonly logEntries: LogEntryService) {}

  /**
   * Perform a task standalone — record a dated completion with its snapshot.
   * `X-Edited-At` initialises the new row's LWW edit time (issue #143), so a
   * create replayed at reconnect never stamps itself later than the edits
   * already queued behind it.
   */
  @Post()
  @ZodSerializerDto(LogEntryDto)
  create(
    @CurrentOwner() owner: Owner,
    @Body() body: CreateLogEntryDto,
    @EditedAt() editedAt?: Date,
  ): Promise<LogEntry> {
    return this.logEntries.create(owner.id, body, editedAt);
  }

  /**
   * List entries — one task's full log history (`?taskId=`) or a whole rig's
   * (`?rigId=`, the due-status read, ADR-0005). Exactly one scope is required;
   * an unscoped list of "all entries" has no screen.
   */
  @Get()
  // Array response: the DTO must be wrapped as `[Dto]` so the serializer
  // validates each element against LogEntrySchema (see RigController).
  @ZodSerializerDto([LogEntryDto])
  list(
    @CurrentOwner() owner: Owner,
    @Query('taskId', new ParseUUIDPipe({ optional: true })) taskId?: string,
    @Query('rigId', new ParseUUIDPipe({ optional: true })) rigId?: string,
  ): Promise<LogEntry[]> {
    if (taskId && !rigId) {
      return this.logEntries.listByTask(owner.id, taskId);
    }
    if (rigId && !taskId) {
      return this.logEntries.listByRig(owner.id, rigId);
    }
    throw new BadRequestException('exactly one of taskId or rigId is required');
  }

  /** Read one of the owner's entries. */
  @Get(':id')
  @ZodSerializerDto(LogEntryDto)
  get(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LogEntry> {
    return this.logEntries.get(owner.id, id);
  }

  /** Correct one of the owner's entries (the date and/or recorded values). */
  @Patch(':id')
  @ZodSerializerDto(LogEntryDto)
  update(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateLogEntryDto,
    @EditedAt() editedAt?: Date,
  ): Promise<LogEntry> {
    return this.logEntries.update(owner.id, id, body, editedAt);
  }

  /** Delete one of the owner's entries (a mistaken record). */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.logEntries.remove(owner.id, id);
  }
}

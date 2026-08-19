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
import type { Owner, Run } from '@rv-checklist/domain';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentOwner } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards.js';
import { CreateRunDto, RunDto, UpdateRunDto } from './run.dto.js';
import { RunService } from './run.service.js';

/**
 * Run endpoints (issue #16 — T6 runs over plain checklists). Every route is
 * behind the JWT guard and scoped to the authenticated owner (ADR-0003): the
 * handler only ever passes `owner.id` to the use-case, which resolves ownership
 * via the run's (or checklist's) rig, so a caller can act on their own rigs'
 * runs and no others. A run's whole `steps` array travels on PATCH, so marking
 * steps, capturing answers, and correcting past state are all one write — no
 * per-step endpoints. Bodies are validated by the shared Zod schemas via the
 * global `ZodValidationPipe`; responses are validated/serialised to {@link RunDto}.
 */
@UseGuards(JwtAuthGuard)
@Controller('runs')
export class RunController {
  constructor(private readonly runs: RunService) {}

  /** Start a run over one of the owner's checklists. */
  @Post()
  @ZodSerializerDto(RunDto)
  create(
    @CurrentOwner() owner: Owner,
    @Body() body: CreateRunDto,
  ): Promise<Run> {
    return this.runs.create(owner.id, body);
  }

  /**
   * List runs — one checklist's history (`?checklistId=`), a whole rig's
   * (`?rigId=`, the home summary read, issue #22), or one trip's
   * (`?tripId=`, the trip screen, issue #111). Exactly one scope is required;
   * an unscoped list of "all runs" has no screen.
   */
  @Get()
  // Array response: the DTO must be wrapped as `[Dto]` so the serializer
  // validates each element against RunSchema (see RigController).
  @ZodSerializerDto([RunDto])
  list(
    @CurrentOwner() owner: Owner,
    @Query('checklistId', new ParseUUIDPipe({ optional: true }))
    checklistId?: string,
    @Query('rigId', new ParseUUIDPipe({ optional: true })) rigId?: string,
    @Query('tripId', new ParseUUIDPipe({ optional: true })) tripId?: string,
  ): Promise<Run[]> {
    if (checklistId && !rigId && !tripId) {
      return this.runs.listByChecklist(owner.id, checklistId);
    }
    if (rigId && !checklistId && !tripId) {
      return this.runs.listByRig(owner.id, rigId);
    }
    if (tripId && !checklistId && !rigId) {
      return this.runs.listByTrip(owner.id, tripId);
    }
    throw new BadRequestException(
      'exactly one of checklistId, rigId, or tripId is required',
    );
  }

  /** Read (resume) one of the owner's runs. */
  @Get(':id')
  @ZodSerializerDto(RunDto)
  get(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Run> {
    return this.runs.get(owner.id, id);
  }

  /** Edit one of the owner's runs (step states, captured answers, and/or the date). */
  @Patch(':id')
  @ZodSerializerDto(RunDto)
  update(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRunDto,
  ): Promise<Run> {
    return this.runs.update(owner.id, id, body);
  }

  /** Delete one of the owner's runs (e.g. one started by mistake). */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.runs.remove(owner.id, id);
  }
}

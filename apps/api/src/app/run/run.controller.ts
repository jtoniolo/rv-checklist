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
import { EditedAt } from '../common/edited-at.decorator.js';
import {
  CreateRunDto,
  RunDto,
  RunStepOpsDto,
  UpdateRunDto,
} from './run.dto.js';
import { RunService } from './run.service.js';

/**
 * Run endpoints (issue #16 — T6 runs over plain checklists). Every route is
 * behind the JWT guard and scoped to the authenticated owner (ADR-0003): the
 * handler only ever passes `owner.id` to the use-case, which resolves ownership
 * via the run's (or checklist's) rig, so a caller can act on their own rigs'
 * runs and no others.
 *
 * Run work goes through `POST :id/step-ops` (ADR-0030, issue #144): each operation names
 * one step, so an offline queue only ever asserts the steps it actually touched. PATCH
 * still takes a whole `steps` array and means the same thing — it is the record-level
 * route, kept for `startedOn` and for callers written before the ops endpoint existed.
 * Bodies are validated by the shared Zod schemas via the global `ZodValidationPipe`;
 * responses are validated/serialised to {@link RunDto}.
 */
@UseGuards(JwtAuthGuard)
@Controller('runs')
export class RunController {
  constructor(private readonly runs: RunService) {}

  /**
   * Start a run over one of the owner's checklists. `X-Edited-At` initialises
   * the new row's LWW edit time (issue #143), so a create replayed at reconnect
   * never stamps itself later than the edits already queued behind it.
   */
  @Post()
  @ZodSerializerDto(RunDto)
  create(
    @CurrentOwner() owner: Owner,
    @Body() body: CreateRunDto,
    @EditedAt() editedAt?: Date,
  ): Promise<Run> {
    return this.runs.create(owner.id, body, editedAt);
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
    @EditedAt() editedAt?: Date,
  ): Promise<Run> {
    return this.runs.update(owner.id, id, body, editedAt);
  }

  /**
   * Record run work as per-step operations (ADR-0030, issue #144) — the write path the
   * offline queue uses, and the one the run screen calls on every tap.
   *
   * A POST because it submits operations rather than a desired state, but it creates no
   * resource, so it answers **200** with the whole run as it now stands (which is also the
   * status a replay reads back out of the idempotency ledger, issue #142). `X-Edited-At`
   * stamps any op that carries no clock reading of its own.
   */
  @Post(':id/step-ops')
  @HttpCode(200)
  @ZodSerializerDto(RunDto)
  applyStepOps(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RunStepOpsDto,
    @EditedAt() editedAt?: Date,
  ): Promise<Run> {
    return this.runs.applyStepOps(owner.id, id, body.ops, editedAt);
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

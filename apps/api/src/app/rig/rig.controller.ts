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
  UseGuards,
} from '@nestjs/common';
import type { Owner, Rig } from '@rv-checklist/domain';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentOwner } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards.js';
import { CreateRigDto, RigDto, UpdateRigDto } from './rig.dto.js';
import { RigService } from './rig.service.js';

/**
 * Rig endpoints (issue #14), the first real feature. Every route is behind the
 * JWT guard and scoped to the authenticated owner (ADR-0003): the handler only
 * ever passes `owner.id` to the use-case, so a caller can act on their own rigs
 * and no others. Bodies are validated by the shared Zod schemas via the global
 * `ZodValidationPipe`; responses are validated/serialised to {@link RigDto}.
 */
@UseGuards(JwtAuthGuard)
@Controller('rigs')
export class RigController {
  constructor(private readonly rigs: RigService) {}

  /** Add a rig for the owner. */
  @Post()
  @ZodSerializerDto(RigDto)
  create(
    @CurrentOwner() owner: Owner,
    @Body() body: CreateRigDto,
  ): Promise<Rig> {
    return this.rigs.create(owner.id, body);
  }

  /** List the owner's rigs. */
  @Get()
  // Array response: the DTO must be wrapped so the serializer validates each
  // element against RigSchema. A bare `RigDto` here parses the whole array as a
  // single object and 500s (nestjs-zod only takes the array path for `[Dto]`).
  @ZodSerializerDto([RigDto])
  list(@CurrentOwner() owner: Owner): Promise<Rig[]> {
    return this.rigs.list(owner.id);
  }

  /** Read one of the owner's rigs. */
  @Get(':id')
  @ZodSerializerDto(RigDto)
  get(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Rig> {
    return this.rigs.get(owner.id, id);
  }

  /** Edit one of the owner's rigs. */
  @Patch(':id')
  @ZodSerializerDto(RigDto)
  update(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRigDto,
  ): Promise<Rig> {
    return this.rigs.update(owner.id, id, body);
  }

  /** Delete one of the owner's rigs. */
  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.rigs.remove(owner.id, id);
  }
}

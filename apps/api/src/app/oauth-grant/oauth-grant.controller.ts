import {
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import type { Owner } from '@rv-checklist/domain';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentOwner } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards.js';
import type { ActiveGrantRow } from '../mcp-auth/oauth-grant.service.js';
import { OAuthGrantService } from '../mcp-auth/oauth-grant.service.js';
import { OAuthGrantListDto } from './oauth-grant.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('oauth-grants')
export class OAuthGrantController {
  constructor(private readonly grants: OAuthGrantService) {}

  @Get()
  @ZodSerializerDto(OAuthGrantListDto)
  async list(@CurrentOwner() owner: Owner): Promise<ActiveGrantRow[]> {
    return this.grants.listActiveByUser(owner.email);
  }

  @Delete(':id')
  @HttpCode(204)
  async revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentOwner() owner: Owner,
  ): Promise<void> {
    const wasRevoked = await this.grants.revokeGrantForUser(id, owner.email);
    if (!wasRevoked) {
      throw new NotFoundException();
    }
  }
}

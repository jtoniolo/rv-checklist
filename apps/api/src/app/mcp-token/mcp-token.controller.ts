import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Owner } from '@rv-checklist/domain';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentOwner } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards.js';
import { McpTokenCreatedDto, McpTokenStatusDto } from './mcp-token.dto.js';
import { McpTokenService } from './mcp-token.service.js';

@UseGuards(JwtAuthGuard)
@Controller('mcp-token')
export class McpTokenController {
  constructor(private readonly mcpTokens: McpTokenService) {}

  @Post()
  @ZodSerializerDto(McpTokenCreatedDto)
  async generate(@CurrentOwner() owner: Owner): Promise<{ token: string }> {
    const token = await this.mcpTokens.generate(owner.id);
    return { token };
  }

  @Get()
  @ZodSerializerDto(McpTokenStatusDto)
  async status(@CurrentOwner() owner: Owner): Promise<{
    active: boolean;
    createdAt?: Date;
    lastUsedAt?: Date | undefined;
  }> {
    const record = await this.mcpTokens.status(owner.id);
    if (!record) {
      return { active: false };
    }
    return {
      active: true,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
    };
  }

  @Delete()
  @HttpCode(204)
  async revoke(@CurrentOwner() owner: Owner): Promise<void> {
    await this.mcpTokens.revoke(owner.id);
  }
}

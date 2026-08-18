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
import type { Owner, WebSession } from '@rv-checklist/domain';
import { ZodSerializerDto } from 'nestjs-zod';
import { AuthService } from '../auth/auth.service.js';
import { CurrentOwner } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards.js';
import { WebSessionListDto } from './session.dto.js';

@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  @ZodSerializerDto(WebSessionListDto)
  async list(@CurrentOwner() owner: Owner): Promise<WebSession[]> {
    const sessions = await this.auth.listSessions(owner.id);
    return sessions.map((s) => ({
      sessionId: s.sessionId,
      // eslint-disable-next-line unicorn/no-null -- Zod .nullable() wire format
      userAgent: s.userAgent ?? null,
      createdAt: s.createdAt.toISOString(),
      // eslint-disable-next-line unicorn/no-null -- Zod .nullable() wire format
      lastUsedAt: s.lastUsedAt ? s.lastUsedAt.toISOString() : null,
    }));
  }

  @Delete(':sessionId')
  @HttpCode(204)
  async revoke(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @CurrentOwner() owner: Owner,
  ): Promise<void> {
    const wasRevoked = await this.auth.revokeSession(sessionId, owner.id);
    if (!wasRevoked) {
      throw new NotFoundException();
    }
  }
}

import { Controller, Get, UseGuards } from '@nestjs/common';
import type { Owner } from '@rv-checklist/domain';
import { CurrentOwner } from './current-user.decorator.js';
import { JwtAuthGuard } from './guards.js';

/**
 * `GET /me` (issue #13) — returns the authenticated owner, read straight from the
 * bearer token's identity. The guard rejects unauthenticated calls, so this is
 * the smallest proof the whole resource-server path works end to end.
 */
@Controller()
export class MeController {
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentOwner() owner: Owner): Owner {
    return owner;
  }
}

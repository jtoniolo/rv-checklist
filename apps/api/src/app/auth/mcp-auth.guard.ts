import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { McpTokenStore, UserStore } from '@rv-checklist/api-data-access';
import type { Request } from 'express';
import { TokenService } from './token.service.js';

const MCP_PREFIX = 'rvmcp_';

/**
 * Authenticates MCP bearer tokens (ADR-0021, ADR-0022). Handles requests
 * whose `Authorization: Bearer` value starts with `rvmcp_`; returns plain
 * 401 on failure — no `WWW-Authenticate` header, no OAuth discovery metadata.
 *
 * On success, sets `req.user` to the {@link Owner} shape so `@CurrentOwner`
 * works unchanged, and fires off a `last_used_at` update without blocking.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: McpTokenStore,
    private readonly users: UserStore,
    private readonly tokenService: TokenService,
  ) {}

  private extractMcpToken(req: Request): string | undefined {
    const header = req.headers.authorization;
    if (!header) return undefined;
    const [scheme, value] = header.split(' ', 2);
    if (scheme !== 'Bearer' || !value?.startsWith(MCP_PREFIX)) return undefined;
    return value;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const raw = this.extractMcpToken(req);
    if (raw === undefined) {
      throw new UnauthorizedException();
    }

    const hash = this.tokenService.hash(raw);
    const record = await this.tokens.findActiveByHash(hash);
    if (!record) {
      throw new UnauthorizedException();
    }

    const user = await this.users.findById(record.userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    (req as unknown as Record<string, unknown>)['user'] = {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    };

    void this.tokens.updateLastUsed(record.id);

    return true;
  }
}

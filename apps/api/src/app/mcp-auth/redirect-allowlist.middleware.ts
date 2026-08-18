import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

export const MCP_REDIRECT_ALLOWLIST = 'MCP_REDIRECT_ALLOWLIST';

/**
 * Middleware applied to the DCR endpoint (ADR-0024). Rejects a registration
 * request whose `redirect_uris` contains any URI not on the configured
 * allowlist. Loopback URIs (`http://localhost` and `http://127.0.0.1`, any
 * port, any path) are always accepted per RFC 8252 §7.3.
 */
@Injectable()
export class RedirectAllowlistMiddleware implements NestMiddleware {
  private readonly allowed: string[];

  constructor(@Inject(MCP_REDIRECT_ALLOWLIST) allowlist: string[]) {
    this.allowed = allowlist;
  }

  private isAllowed(uri: string): boolean {
    if (this.allowed.includes(uri)) return true;

    try {
      const parsed = new URL(uri);
      if (
        parsed.protocol === 'http:' &&
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
      ) {
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  use(req: Request, _res: Response, next: NextFunction): void {
    const body = req.body as Record<string, unknown> | undefined;
    const uris: unknown = body?.['redirect_uris'];
    if (!Array.isArray(uris)) {
      next();
      return;
    }

    for (const raw of uris) {
      if (typeof raw !== 'string') continue;
      if (!this.isAllowed(raw)) {
        throw new BadRequestException(`Redirect URI not allowed: ${raw}`);
      }
    }
    next();
  }
}

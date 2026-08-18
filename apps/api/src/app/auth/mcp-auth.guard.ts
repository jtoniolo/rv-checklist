import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { JwtTokenService, type JwtPayload } from '@rekog/mcp-nest-auth';
import { McpTokenStore, UserStore } from '@rv-checklist/api-data-access';
import type { Response, Request } from 'express';
import { OAuthGrantService } from '../mcp-auth/oauth-grant.service.js';
import { TokenService } from './token.service.js';

const MCP_PREFIX = 'rvmcp_';

interface OAuthModuleOptions {
  serverUrl?: string;
  resource?: string;
}

/**
 * Composite guard for the MCP endpoint (ADR-0024). Routes by bearer prefix:
 *
 * - `rvmcp_` tokens take the static hash-check path (ADR-0022). Failure is
 *   a plain 401 with no `WWW-Authenticate` header.
 * - All other bearers (including missing) take the JWT path. Failure is a
 *   401 with `WWW-Authenticate: Bearer resource_metadata="<PRM URL>"`.
 *
 * Both paths resolve `req.user` to the same Owner shape (`{ id, email,
 * name, picture }`) and fire a non-blocking `last_used_at` update.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  private readonly logger = new Logger(McpAuthGuard.name);

  constructor(
    private readonly tokens: McpTokenStore,
    private readonly users: UserStore,
    private readonly tokenService: TokenService,
    private readonly moduleRef: ModuleRef,
  ) {}

  private extractBearer(req: Request): string | undefined {
    const header = req.headers.authorization;
    if (!header) return undefined;
    const [scheme, value] = header.split(' ', 2);
    if (scheme !== 'Bearer' || !value) return undefined;
    return value;
  }

  private async staticPath(req: Request, raw: string): Promise<boolean> {
    const hash = this.tokenService.hash(raw);
    const record = await this.tokens.findActiveByHash(hash);
    if (!record) {
      throw new UnauthorizedException();
    }

    const user = await this.users.findById(record.userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    this.setOwner(req, user.id, user.email, user.name, user.picture);
    void this.tokens.updateLastUsed(record.id);

    return true;
  }

  private async jwtPath(
    context: ExecutionContext,
    req: Request,
    bearer: string | undefined,
  ): Promise<boolean> {
    const jwtService = this.resolveByClass(JwtTokenService);
    const options = this.resolveByToken('OAUTH_MODULE_OPTIONS') as
      OAuthModuleOptions | undefined;

    if (!jwtService || !options) {
      this.logger.warn(
        'JWT auth services not available; rejecting non-static token',
      );
      this.attachChallenge(context, options);
      throw new UnauthorizedException();
    }

    if (!bearer) {
      this.attachChallenge(context, options);
      throw new UnauthorizedException();
    }

    const payload = jwtService.validateToken(bearer, {
      type: 'access',
      audience: options.resource,
    });
    if (!payload) {
      this.attachChallenge(context, options);
      throw new UnauthorizedException();
    }

    const grantId = (payload as JwtPayload & { grant_id?: string }).grant_id;
    if (grantId) {
      const grantService = this.resolveByClass(OAuthGrantService);
      if (grantService) {
        const isActive = await grantService.isGrantActive(grantId);
        if (!isActive) {
          this.attachChallenge(context, options);
          throw new UnauthorizedException();
        }
        void grantService.touchLastUsed(grantId);
      }
    }

    const owner = await this.resolveOwnerFromJwt(
      payload.user_profile_id ?? payload.sub,
    );
    if (!owner) {
      this.attachChallenge(context, options);
      throw new UnauthorizedException();
    }

    this.setOwner(req, owner.id, owner.email, owner.name, owner.picture);
    return true;
  }

  private async resolveOwnerFromJwt(
    profileId: string,
  ): Promise<
    { id: string; email: string; name?: string; picture?: string } | undefined
  > {
    const store = this.resolveByToken('IOAuthStore') as
      | {
          getUserProfileById(
            id: string,
          ): Promise<{ id: string; email?: string } | undefined>;
        }
      | undefined;

    if (!store) {
      this.logger.warn('IOAuthStore not available for profile lookup');
      return undefined;
    }

    const profile = await store.getUserProfileById(profileId);
    if (!profile?.email) {
      this.logger.warn(`No profile or email for profile ID ${profileId}`);
      return undefined;
    }

    const user = await this.users.findByEmail(profile.email);
    if (!user) {
      this.logger.warn(`No app user for OAuth email ${profile.email}`);
      return undefined;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
    };
  }

  private setOwner(
    req: Request,
    id: string,
    email: string,
    name: string | undefined,
    picture: string | undefined,
  ): void {
    (req as unknown as Record<string, unknown>)['user'] = {
      id,
      email,
      name,
      picture,
    };
  }

  private attachChallenge(
    context: ExecutionContext,
    options: OAuthModuleOptions | undefined,
  ): void {
    if (!options?.serverUrl) return;
    try {
      const prmUrl = `${options.serverUrl.replace(/\/$/, '')}/.well-known/oauth-protected-resource`;
      const res = context.switchToHttp().getResponse<Response>();
      res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${prmUrl}"`);
    } catch {
      // best-effort
    }
  }

  private resolveByClass<T>(cls: new (...args: never[]) => T): T | undefined {
    try {
      return this.moduleRef.get(cls, { strict: false });
    } catch {
      return undefined;
    }
  }

  private resolveByToken(token: string): unknown {
    try {
      return this.moduleRef.get(token, { strict: false });
    } catch {
      return undefined;
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const bearer = this.extractBearer(req);

    if (bearer?.startsWith(MCP_PREFIX)) {
      return this.staticPath(req, bearer);
    }

    return this.jwtPath(context, req, bearer);
  }
}

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Owner } from '@rv-checklist/domain';
import type { GoogleProfile } from './google-verifier.js';

/**
 * The authenticated owner, put on the request by {@link JwtStrategy}. The seam
 * every owner-scoped handler reaches for to get the id it scopes queries to
 * (ADR-0003).
 */
export const CurrentOwner = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Owner =>
    ctx.switchToHttp().getRequest<{ user: Owner }>().user,
);

/** The verified Google profile, put on the request by the Google strategy. */
export const CurrentGoogleProfile = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): GoogleProfile =>
    ctx.switchToHttp().getRequest<{ user: GoogleProfile }>().user,
);

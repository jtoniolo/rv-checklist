import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  Inject,
  Logger,
} from '@nestjs/common';
import type { IOAuthStore } from '@rekog/mcp-nest-auth';
import type { Request, Response } from 'express';
import { UnknownOAuthUserException } from './gated-oauth-store.js';

/**
 * Catches {@link UnknownOAuthUserException} thrown by the gated store and
 * redirects back to the client's `redirect_uri` with
 * `error=access_denied` — the same flow the library uses when the user
 * denies consent.
 *
 * The redirect URI and client state come from the in-flight OAuth session
 * (stored in the `oauth_session` cookie). If the session is missing or
 * expired the filter falls through to a plain 403.
 */
@Catch(UnknownOAuthUserException)
export class UnknownOAuthUserFilter implements ExceptionFilter {
  private readonly logger = new Logger(UnknownOAuthUserFilter.name);

  constructor(
    @Inject('IOAuthStore') private readonly store: IOAuthStore,
    @Inject('OAUTH_MODULE_OPTIONS')
    private readonly options: { jwtIssuer: string },
  ) {}

  async catch(exception: UnknownOAuthUserException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const sessionId: string | undefined = (
      req.cookies as Record<string, string> | undefined
    )?.['oauth_session'];

    if (sessionId) {
      const session = await this.store.getOAuthSession(sessionId);
      if (session?.redirectUri) {
        this.logger.warn(
          `Unknown user rejected — redirecting to ${session.redirectUri}`,
        );

        await this.store.removeOAuthSession(sessionId);
        res.clearCookie('oauth_session');
        res.clearCookie('oauth_state');
        res.clearCookie('auth_token');

        const url = new URL(session.redirectUri);
        url.searchParams.set('error', 'access_denied');
        url.searchParams.set(
          'error_description',
          'No application account is associated with this Google account',
        );
        if (session.oauthState) {
          url.searchParams.set('state', session.oauthState);
        }
        url.searchParams.set('iss', this.options.jwtIssuer);
        res.redirect(302, url.href);
        return;
      }
    }

    this.logger.error(
      'Unknown user rejected but no session to redirect — returning 403',
    );
    res.status(403).json({
      statusCode: 403,
      message: exception.message,
    });
  }
}

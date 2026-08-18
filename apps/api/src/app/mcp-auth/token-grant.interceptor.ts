import { createHmac } from 'node:crypto';
import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { IOAuthStore } from '@rekog/mcp-nest-auth';
import type { Request } from 'express';
import { type Observable, from, switchMap } from 'rxjs';
import {
  OAuthGrantService,
  RefreshTokenReuseError,
  RevokedGrantError,
  UnknownRefreshTokenError,
  type SpendResult,
} from './oauth-grant.service.js';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

/**
 * Intercepts the OAuth token endpoint to enforce grant-level tracking,
 * refresh-token rotation with reuse detection, redirect_uri validation,
 * and grant_id claims (ADR-0024, issue #94).
 *
 * Applied globally via APP_INTERCEPTOR; short-circuits for non-token
 * requests.
 *
 * Pre-flight (before the library's controller runs):
 *  - `refresh_token` grant: validates the incoming refresh token against
 *    the grant store; detects reuse and revokes the grant if found.
 *  - `authorization_code` grant: validates that the token request's
 *    redirect_uri exactly matches the one stored with the authorization
 *    code (RFC 6749 §4.1.3).
 *
 * Post-flight (after the library returns the token pair):
 *  - Creates a grant record (auth code flow) or extends the existing
 *    grant's refresh token chain (refresh flow).
 *  - Re-signs both tokens with an added `grant_id` claim.
 */
@Injectable()
export class TokenGrantInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TokenGrantInterceptor.name);
  private readonly jwtSecret: string;

  constructor(
    private readonly grantService: OAuthGrantService,
    @Inject('IOAuthStore') private readonly store: IOAuthStore,
    @Inject('OAUTH_MODULE_OPTIONS')
    options: { jwtSecret: string },
  ) {
    this.jwtSecret = options.jwtSecret;
  }

  private async preFlightRefresh(
    refreshToken: string,
  ): Promise<SpendResult | undefined> {
    try {
      return await this.grantService.spendRefreshToken(refreshToken);
    } catch (error) {
      if (
        error instanceof RefreshTokenReuseError ||
        error instanceof RevokedGrantError
      ) {
        throw new HttpException(
          {
            error: 'invalid_grant',
            error_description: 'The refresh token has been revoked',
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (error instanceof UnknownRefreshTokenError) {
        return undefined;
      }
      throw error;
    }
  }

  private async preFlightAuthCode(
    code: string,
    redirectUri: string | undefined,
  ): Promise<void> {
    const authCode = await this.store.getAuthCode(code);
    if (!authCode) return;

    if (!redirectUri) {
      this.logger.warn(
        'redirect_uri missing from token request but required by stored auth code',
      );
      throw new HttpException(
        {
          error: 'invalid_grant',
          error_description:
            'redirect_uri is required and must match the authorization request',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (redirectUri !== authCode.redirect_uri) {
      this.logger.warn(
        `redirect_uri mismatch: expected ${authCode.redirect_uri}, ` +
          `got ${redirectUri}`,
      );
      throw new HttpException(
        {
          error: 'invalid_grant',
          error_description:
            'redirect_uri does not match the authorization request',
        },
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async postFlight(
    response: TokenResponse,
    grantType: string | undefined,
    spendResult: SpendResult | undefined,
  ): Promise<TokenResponse> {
    if (!response.access_token) return response;

    if (grantType === 'authorization_code') {
      return this.postFlightAuthCode(response);
    }

    if (grantType === 'refresh_token' && spendResult) {
      return this.postFlightRefresh(response, spendResult);
    }

    return response;
  }

  private async postFlightAuthCode(
    response: TokenResponse,
  ): Promise<TokenResponse> {
    const payload = decodeJwtPayload(response.access_token);
    const userId = payload['sub'] as string;
    const azp = payload['azp'];
    const clientId = typeof azp === 'string' ? azp : '';
    const scope = payload['scope'] as string | undefined;

    const grantId = await this.grantService.createGrant(
      userId,
      clientId,
      scope,
    );

    if (response.refresh_token) {
      await this.grantService.recordRefreshToken(
        grantId,
        response.refresh_token,
        1,
      );
    }

    return this.addGrantId(response, grantId);
  }

  private async postFlightRefresh(
    response: TokenResponse,
    { grantId, generation }: SpendResult,
  ): Promise<TokenResponse> {
    if (response.refresh_token) {
      await this.grantService.recordRefreshToken(
        grantId,
        response.refresh_token,
        generation + 1,
      );
    }

    return this.addGrantId(response, grantId);
  }

  private addGrantId(response: TokenResponse, grantId: string): TokenResponse {
    const claims = { grant_id: grantId };
    const result: TokenResponse = {
      ...response,
      access_token: resignWithClaim(
        response.access_token,
        claims,
        this.jwtSecret,
      ),
    };
    if (response.refresh_token) {
      result.refresh_token = resignWithClaim(
        response.refresh_token,
        claims,
        this.jwtSecret,
      );
    }
    return result;
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<Request>();

    if (req.method !== 'POST' || !req.path.endsWith('/token')) {
      return next.handle();
    }

    const body = parseBody(req);
    const grantType = body['grant_type'];

    let spendResult: SpendResult | undefined;
    if (grantType === 'refresh_token' && body['refresh_token']) {
      spendResult = await this.preFlightRefresh(body['refresh_token']);
    }

    if (grantType === 'authorization_code' && body['code']) {
      await this.preFlightAuthCode(body['code'], body['redirect_uri']);
    }

    return next
      .handle()
      .pipe(
        switchMap((response) =>
          from(
            this.postFlight(response as TokenResponse, grantType, spendResult),
          ),
        ),
      );
  }
}

function parseBody(req: Request): Record<string, string> {
  const body: unknown = req.body;
  if (body && typeof body === 'object' && Object.keys(body).length > 0) {
    return body as Record<string, string>;
  }
  if (typeof body === 'string' && body.length > 0) {
    return Object.fromEntries(new URLSearchParams(body));
  }
  return {};
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payloadB64] = token.split('.', 3);
  return JSON.parse(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- JWT always has three parts
    Buffer.from(payloadB64!, 'base64url').toString(),
  ) as Record<string, unknown>;
}

/**
 * Decode a JWT, merge extra claims into its payload, and re-sign with
 * HS256. The original `exp` and `iat` are preserved so the token's
 * lifetime is unchanged.
 */
function resignWithClaim(
  token: string,
  claims: Record<string, unknown>,
  secret: string,
): string {
  const [headerB64, payloadB64] = token.split('.', 3);
  const payload = JSON.parse(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- JWT always has three parts
    Buffer.from(payloadB64!, 'base64url').toString(),
  ) as Record<string, unknown>;
  const merged = { ...payload, ...claims };
  const newPayloadB64 = Buffer.from(JSON.stringify(merged)).toString(
    'base64url',
  );
  const signature = createHmac('sha256', secret)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- JWT always has three parts
    .update(`${headerB64!}.${newPayloadB64}`)
    .digest('base64url');
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- JWT always has three parts
  return `${headerB64!}.${newPayloadB64}.${signature}`;
}

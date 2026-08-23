import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Owner } from '@rv-checklist/domain';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import {
  CurrentGoogleProfile,
  CurrentOwner,
} from './current-user.decorator.js';
import type { GoogleProfile } from './google-verifier.js';
import { GoogleAuthGuard, JwtAuthGuard } from './guards.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  TokenService,
  type PowerSyncCredentials,
} from './token.service.js';

/**
 * Auth endpoints (ADR-0002, ADR-0019). Sign-in exchanges a Google One Tap
 * credential for httpOnly auth cookies; refresh rotates them; logout clears and
 * revokes. The controller is the only HTTP-aware layer — the service stays
 * transport-free.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  /** Exchange a verified Google credential (One Tap) for httpOnly auth cookies. */
  @UseGuards(GoogleAuthGuard)
  @HttpCode(200)
  @Post('google')
  async loginWithGoogle(
    @CurrentGoogleProfile() profile: GoogleProfile,
    @Res({ passthrough: true }) res: Response,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    const { pair } = await this.auth.loginWithGoogle(profile, userAgent);
    res.cookie(
      ACCESS_COOKIE,
      pair.accessToken,
      this.tokens.accessCookieOptions(),
    );
    res.cookie(
      REFRESH_COOKIE,
      pair.refreshToken,
      this.tokens.refreshCookieOptions(),
    );
  }

  /** Rotate cookies: read the refresh token from the cookie, issue fresh pair. */
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Res({ passthrough: true }) res: Response,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    const cookies = (res.req as { cookies?: Record<string, string> }).cookies;
    const refreshToken = cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      throw new BadRequestException('Refresh cookie is required');
    }
    const { pair } = await this.auth.refresh(refreshToken, userAgent);
    res.cookie(
      ACCESS_COOKIE,
      pair.accessToken,
      this.tokens.accessCookieOptions(),
    );
    res.cookie(
      REFRESH_COOKIE,
      pair.refreshToken,
      this.tokens.refreshCookieOptions(),
    );
  }

  /**
   * Mint PowerSync credentials for the signed-in user (ADR-0028): a short-lived
   * HS256 JWT the sync service validates, plus the endpoint to connect to —
   * the exact shape the PowerSync connector's `fetchCredentials` returns.
   */
  @UseGuards(JwtAuthGuard)
  @Get('powersync-token')
  powersyncToken(@CurrentOwner() owner: Owner): PowerSyncCredentials {
    return this.tokens.signPowerSyncToken(owner.id);
  }

  /** Clear auth cookies and revoke the refresh token. */
  @HttpCode(204)
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response): Promise<void> {
    const cookies = (res.req as { cookies?: Record<string, string> }).cookies;
    const refreshToken = cookies?.[REFRESH_COOKIE];
    if (refreshToken) {
      await this.auth.logout(refreshToken);
    }
    res.cookie(ACCESS_COOKIE, '', this.tokens.clearCookieOptions());
    res.cookie(REFRESH_COOKIE, '', this.tokens.clearCookieOptions());
  }
}

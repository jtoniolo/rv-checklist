import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Owner } from '@rv-checklist/domain';
import type { Response } from 'express';
import type { Env } from '../config/env.js';
import { AuthService } from './auth.service.js';
import {
  CurrentGoogleProfile,
  CurrentOwner,
} from './current-user.decorator.js';
import { E2eLoginDto } from './e2e-login.dto.js';
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
    private readonly config: ConfigService<Env, true>,
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

  /**
   * A Google-verification-free sign-in for the offline-charter Playwright
   * suite (issue #156), which has no headless path through One Tap. 404s
   * (indistinguishable from a route that never existed) unless
   * `E2E_TEST_AUTH` is set — never true outside that suite's own boot. Runs
   * the same {@link AuthService.loginWithGoogle} as the real endpoint against
   * a synthetic, always-"verified" profile keyed by the given email, so
   * cookies, first-login seeding, and session tracking all behave exactly as
   * they do for a real owner.
   */
  @HttpCode(200)
  @Post('e2e-login')
  async e2eLogin(
    @Body() body: E2eLoginDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('user-agent') userAgent?: string,
  ): Promise<void> {
    if (!this.config.get('E2E_TEST_AUTH', { infer: true })) {
      throw new NotFoundException();
    }
    const profile: GoogleProfile = {
      sub: `e2e:${body.email}`,
      email: body.email,
      emailVerified: true,
      name: 'E2E Test Owner',
      picture: undefined,
    };
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

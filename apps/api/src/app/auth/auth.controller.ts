import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RefreshSchema, type TokenPair } from '@rv-checklist/domain';
import { AuthService } from './auth.service.js';
import { CurrentGoogleProfile } from './current-user.decorator.js';
import type { GoogleProfile } from './google-verifier.js';
import { GoogleAuthGuard } from './guards.js';

/**
 * Auth endpoints (ADR-0002). Sign-in exchanges a Google One Tap credential for a
 * first-party token pair; refresh rotates the long-lived token; logout revokes
 * it. All are stateless from the resource server's point of view — no session is
 * created.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Exchange a verified Google credential (One Tap) for a first-party token pair. */
  @UseGuards(GoogleAuthGuard)
  @HttpCode(200)
  @Post('google')
  loginWithGoogle(
    @CurrentGoogleProfile() profile: GoogleProfile,
  ): Promise<TokenPair> {
    return this.auth.loginWithGoogle(profile);
  }

  /** Rotate a refresh token for a fresh pair, keeping the session alive. */
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() body: unknown): Promise<TokenPair> {
    const parsed = RefreshSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('refreshToken is required');
    }
    return this.auth.refresh(parsed.data.refreshToken);
  }

  /** Revoke a refresh token (sign out on this device). */
  @HttpCode(204)
  @Post('logout')
  async logout(@Body() body: unknown): Promise<void> {
    const parsed = RefreshSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('refreshToken is required');
    }
    await this.auth.logout(parsed.data.refreshToken);
  }
}

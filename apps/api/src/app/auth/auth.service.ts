import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  RefreshTokenStore,
  UserStore,
  type UserRecord,
} from '@rv-checklist/api-data-access';
import { StarterContentSeeder } from '../seed/seed.service.js';
import { Clock } from './clock.js';
import type { GoogleProfile } from './google-verifier.js';
import { TokenService } from './token.service.js';

/** The raw token values the controller uses to set cookies; no HTTP concern. */
export interface IssuedTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresIn: number;
}

/**
 * The auth flow (ADR-0002, ADR-0019). Turns a verified Google identity into a
 * token pair, renews it with rotating refresh tokens for a months-long session,
 * and revokes on logout. It holds no HTTP or persistence detail — it depends
 * only on the store ports and the token/clock helpers, so the whole flow is
 * exercised in unit tests with no database and no Nest container.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly users: UserStore,
    private readonly refreshTokens: RefreshTokenStore,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
    private readonly seeder: StarterContentSeeder,
  ) {}

  /** Mint an access JWT and a persisted refresh token for the user. */
  private async issue(
    user: UserRecord,
  ): Promise<{ pair: IssuedTokens; refreshId: string }> {
    const { token: accessToken, expiresIn } = this.tokens.signAccessToken(user);
    const rawRefresh = this.tokens.generateRefreshValue();
    const now = this.clock.now();
    const created = await this.refreshTokens.create({
      userId: user.id,
      tokenHash: this.tokens.hash(rawRefresh),
      expiresAt: this.tokens.refreshExpiry(now),
    });
    return {
      pair: { accessToken, refreshToken: rawRefresh, expiresIn },
      refreshId: created.id,
    };
  }

  /**
   * Sign in with a verified Google profile: upsert the owner, issue tokens.
   * A brand-new owner also gets the starter rig seeded (issue #19), so day
   * one is never an empty app.
   */
  async loginWithGoogle(
    profile: GoogleProfile,
  ): Promise<{ pair: IssuedTokens }> {
    if (!profile.emailVerified) {
      throw new UnauthorizedException('Google email is not verified');
    }
    const { user, created } = await this.users.upsertByGoogleSub({
      googleSub: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });
    if (created) {
      try {
        await this.seeder.seedStarterContent(user.id);
      } catch (error) {
        this.logger.error(
          `Seeding starter content for new owner ${user.id} failed`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    const { pair } = await this.issue(user);
    return { pair };
  }

  /** Exchange a valid refresh token for a fresh pair, rotating the old one out. */
  async refresh(rawToken: string): Promise<{ pair: IssuedTokens }> {
    const stored = await this.refreshTokens.findByHash(
      this.tokens.hash(rawToken),
    );
    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const isExpired = stored.expiresAt.getTime() <= this.clock.now().getTime();
    if (isExpired || stored.revokedAt !== undefined) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.users.findById(stored.userId);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const { pair, refreshId } = await this.issue(user);
    await this.refreshTokens.revoke(stored.id, refreshId);
    return { pair };
  }

  /** Revoke the presented refresh token; unknown tokens are a silent no-op. */
  async logout(rawToken: string): Promise<void> {
    const stored = await this.refreshTokens.findByHash(
      this.tokens.hash(rawToken),
    );
    if (!stored || stored.revokedAt !== undefined) {
      return;
    }
    await this.refreshTokens.revoke(stored.id, undefined);
  }
}

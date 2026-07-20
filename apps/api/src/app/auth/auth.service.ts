import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  RefreshTokenStore,
  UserStore,
  type UserRecord,
} from '@rv-checklist/api-data-access';
import type { TokenPair } from '@rv-checklist/domain';
import { Clock } from './clock.js';
import type { GoogleProfile } from './google-verifier.js';
import { TokenService } from './token.service.js';

/**
 * The auth flow (ADR-0002). Turns a verified Google identity into a first-party
 * token pair, renews it with rotating refresh tokens for a months-long session,
 * and revokes on logout. It holds no HTTP or persistence detail — it depends
 * only on the store ports and the token/clock helpers, so the whole flow is
 * exercised in unit tests with no database and no Nest container.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserStore,
    private readonly refreshTokens: RefreshTokenStore,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
  ) {}

  /** Mint an access JWT and a persisted refresh token for the user. */
  private async issue(
    user: UserRecord,
  ): Promise<{ pair: TokenPair; refreshId: string }> {
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

  /** Sign in with a verified Google profile: upsert the owner, issue tokens. */
  async loginWithGoogle(profile: GoogleProfile): Promise<TokenPair> {
    if (!profile.emailVerified) {
      throw new UnauthorizedException('Google email is not verified');
    }
    const user = await this.users.upsertByGoogleSub({
      googleSub: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });
    const { pair } = await this.issue(user);
    return pair;
  }

  /** Exchange a valid refresh token for a fresh pair, rotating the old one out. */
  async refresh(rawToken: string): Promise<TokenPair> {
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
    return pair;
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

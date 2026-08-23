import { randomUUID } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  RefreshTokenStore,
  UserStore,
  type RefreshTokenRecord,
  type UserRecord,
  type WebSessionRecord,
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
 *
 * Issue #98 adds session tracking: login creates a new session_id; refresh
 * propagates the session_id from the rotated token. The owner can list and
 * revoke sessions from the connected-apps page. The short-lived access JWT
 * survives until expiry (ADR-0002 accepted gap) — revoking a session only
 * prevents new refreshes.
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
    opts: {
      sessionId: string | undefined;
      userAgent: string | undefined;
    },
  ): Promise<{ pair: IssuedTokens; refreshId: string }> {
    const { token: accessToken, expiresIn } = this.tokens.signAccessToken(user);
    const rawRefresh = this.tokens.generateRefreshValue();
    const now = this.clock.now();
    const created = await this.refreshTokens.create({
      userId: user.id,
      tokenHash: this.tokens.hash(rawRefresh),
      expiresAt: this.tokens.refreshExpiry(now),
      sessionId: opts.sessionId,
      userAgent: opts.userAgent,
    });
    return {
      pair: { accessToken, refreshToken: rawRefresh, expiresIn },
      refreshId: created.id,
    };
  }

  /**
   * Whether a revoked token is a legitimate in-window rotation replay
   * (ADR-0028). Requires all of:
   * - it was rotated out (`replacedById` set — logout and session revocation
   *   leave it unset),
   * - the reuse interval since its revocation has not elapsed,
   * - the rotation chain it started still ends in a live token. Logout and
   *   session revocation revoke the chain tip without a replacement, so after
   *   either the walk hits a dead end and the replay is rejected — revocation
   *   stays final (#98) even inside the window.
   */
  private async isReplayableRotation(
    stored: RefreshTokenRecord,
    now: Date,
  ): Promise<boolean> {
    if (stored.revokedAt === undefined || stored.replacedById === undefined) {
      return false;
    }
    const isInWindow =
      now.getTime() - stored.revokedAt.getTime() <=
      this.tokens.refreshReuseWindowMs();
    if (!isInWindow) {
      return false;
    }
    let nextId: string | undefined = stored.replacedById;
    while (nextId !== undefined) {
      const next = await this.refreshTokens.findById(nextId);
      if (!next) {
        return false;
      }
      if (next.revokedAt === undefined) {
        return true;
      }
      nextId = next.replacedById;
    }
    return false;
  }

  /**
   * Sign in with a verified Google profile: upsert the owner, issue tokens.
   * A brand-new owner also gets the starter rig seeded (issue #19), so day
   * one is never an empty app. Each login starts a new session (issue #98).
   */
  async loginWithGoogle(
    profile: GoogleProfile,
    userAgent?: string,
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
    const sessionId = randomUUID();
    const { pair } = await this.issue(user, { sessionId, userAgent });
    return { pair };
  }

  /**
   * Exchange a valid refresh token for a fresh pair, rotating the old one out.
   * The session_id propagates from the old token so the rotation chain stays
   * grouped (issue #98).
   *
   * A rotated-out token is still accepted for a short reuse interval
   * (ADR-0028 amending ADR-0012): on an unreliable network the rotation
   * response can be lost, leaving the client holding the spent token; inside
   * the window it gets a fresh sibling pair in the same session instead of a
   * dead session. Only rotation qualifies — logout and session revocation
   * leave `replacedById` unset and stay final. A replay is also honored only
   * while its rotation chain still ends in a live token, so revoking the
   * successor (logout or session revocation) closes the predecessor's window
   * too instead of resurrecting a dead session.
   */
  async refresh(
    rawToken: string,
    userAgent?: string,
  ): Promise<{ pair: IssuedTokens }> {
    const stored = await this.refreshTokens.findByHash(
      this.tokens.hash(rawToken),
    );
    if (!stored) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const now = this.clock.now();
    if (stored.expiresAt.getTime() <= now.getTime()) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const isRevoked = stored.revokedAt !== undefined;
    if (isRevoked && !(await this.isReplayableRotation(stored, now))) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.users.findById(stored.userId);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const { pair, refreshId } = await this.issue(user, {
      sessionId: stored.sessionId,
      userAgent,
    });
    if (!isRevoked) {
      // An in-window replay must not re-revoke: that would refresh
      // `revokedAt` and slide the reuse window open indefinitely.
      await this.refreshTokens.revoke(stored.id, refreshId);
    }
    if (stored.sessionId) {
      await this.refreshTokens.updateLastUsed(refreshId);
    }
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

  /** List the owner's active web sessions (issue #98). */
  async listSessions(userId: string): Promise<WebSessionRecord[]> {
    return this.refreshTokens.findActiveSessionsByUser(userId);
  }

  /**
   * Revoke a web session (issue #98). Revokes every refresh token in the
   * chain so the session dies at its next refresh. Ownership is enforced:
   * the caller must own the session.
   */
  async revokeSession(sessionId: string, userId: string): Promise<boolean> {
    const sessions = await this.refreshTokens.findActiveSessionsByUser(userId);
    const isOwned = sessions.some((s) => s.sessionId === sessionId);
    if (!isOwned) {
      return false;
    }
    await this.refreshTokens.revokeBySessionId(sessionId);
    return true;
  }
}

import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions } from 'express';
import type { Env } from '../config/env.js';

/** Claims carried by the first-party access JWT. */
export interface AccessTokenClaims {
  readonly sub: string;
  readonly email: string;
}

export const ACCESS_COOKIE = 'rv.access';
export const REFRESH_COOKIE = 'rv.refresh';

/**
 * Fixed `kid`/`aud` for PowerSync client JWTs (ADR-0028). Both are baked into
 * the sync service's auth config (inline JWKS key id and accepted audience) in
 * `tools/dev/powersync/powersync.yaml` and the chart's PowerSync ConfigMap —
 * change them together or the service rejects every token.
 */
export const POWERSYNC_KID = 'powersync';
export const POWERSYNC_AUDIENCE = 'powersync';

/** What the PowerSync connector's `fetchCredentials` expects (ADR-0028). */
export interface PowerSyncCredentials {
  readonly token: string;
  readonly endpoint: string;
}

/**
 * Mints and hashes the two token kinds (ADR-0002). The access token is a signed,
 * short-lived JWT the API validates statelessly. The refresh token is a
 * high-entropy opaque secret — never a JWT — stored only as a SHA-256 hash, so a
 * database leak can't be replayed.
 *
 * Also provides the cookie configuration for httpOnly transport (ADR-0019).
 */
@Injectable()
export class TokenService {
  private readonly jwt: JwtService;
  private readonly config: ConfigService<Env, true>;

  constructor(jwt: JwtService, config: ConfigService<Env, true>) {
    this.jwt = jwt;
    this.config = config;
  }

  private baseCookieOptions(): CookieOptions {
    const domain = this.config.get('COOKIE_DOMAIN', { infer: true });
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: domain !== undefined,
      path: '/',
      ...(domain && { domain }),
    };
  }

  /** Sign an access JWT for the user and report its lifetime in seconds. */
  signAccessToken(user: { readonly id: string; readonly email: string }): {
    token: string;
    expiresIn: number;
  } {
    const expiresIn = this.config.get('JWT_ACCESS_TTL', { infer: true });
    const claims: Pick<AccessTokenClaims, 'email'> = { email: user.email };
    const token = this.jwt.sign(claims, { subject: user.id, expiresIn });
    return { token, expiresIn };
  }

  /**
   * Mint the credentials the PowerSync web SDK connects with (ADR-0028). The
   * sync service validates the JWT against its inline JWKS: HS256 with the
   * base64url-decoded POWERSYNC_JWT_SECRET, a matching `kid`, and the
   * `powersync` audience. `sub` is the user id — the sync rules read it as
   * `token_parameters.user_id` to pick the user's buckets. Reuses the access
   * TTL: short (PowerSync wants ≤ 60 min), and the SDK re-fetches on expiry.
   */
  signPowerSyncToken(userId: string): PowerSyncCredentials {
    const key = Buffer.from(
      this.config.get('POWERSYNC_JWT_SECRET', { infer: true }),
      'base64url',
    );
    const expiresIn = this.config.get('JWT_ACCESS_TTL', { infer: true });
    const token = this.jwt.sign(
      {},
      {
        secret: key,
        algorithm: 'HS256',
        keyid: POWERSYNC_KID,
        subject: userId,
        audience: POWERSYNC_AUDIENCE,
        expiresIn,
      },
    );
    return {
      token,
      endpoint: this.config.get('POWERSYNC_URL', { infer: true }),
    };
  }

  /** A fresh opaque refresh-token secret, safe to hand to the client. */
  generateRefreshValue(): string {
    return randomBytes(32).toString('base64url');
  }

  /** The stored form of a refresh-token secret. */
  hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /** When a refresh token minted now should expire (Gmail-like months out). */
  refreshExpiry(now: Date): Date {
    const days = this.config.get('REFRESH_TTL_DAYS', { infer: true });
    return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  }

  /** How long a rotated-out refresh token may still be replayed (ADR-0028). */
  refreshReuseWindowMs(): number {
    const seconds = this.config.get('REFRESH_REUSE_INTERVAL_SECONDS', {
      infer: true,
    });
    return seconds * 1000;
  }

  accessCookieOptions(): CookieOptions {
    const expiresIn = this.config.get('JWT_ACCESS_TTL', { infer: true });
    return { ...this.baseCookieOptions(), maxAge: expiresIn * 1000 };
  }

  refreshCookieOptions(): CookieOptions {
    const days = this.config.get('REFRESH_TTL_DAYS', { infer: true });
    return { ...this.baseCookieOptions(), maxAge: days * 24 * 60 * 60 * 1000 };
  }

  clearCookieOptions(): CookieOptions {
    return { ...this.baseCookieOptions(), maxAge: 0 };
  }
}

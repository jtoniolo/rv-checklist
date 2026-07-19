import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '../config/env.js';

/** Claims carried by the first-party access JWT. */
export interface AccessTokenClaims {
  readonly sub: string;
  readonly email: string;
}

/**
 * Mints and hashes the two token kinds (ADR-0002). The access token is a signed,
 * short-lived JWT the API validates statelessly. The refresh token is a
 * high-entropy opaque secret — never a JWT — stored only as a SHA-256 hash, so a
 * database leak can't be replayed.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

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
}

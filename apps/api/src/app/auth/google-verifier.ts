import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { Env } from '../config/env.js';

/** The identity Google asserts, normalised to what the platform needs (ADR-0002). */
export interface GoogleProfile {
  readonly sub: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string | undefined;
  readonly picture: string | undefined;
}

/**
 * Port: verify a Google ID token and return the asserted profile, or throw if it
 * is invalid. Abstract so the auth flow can be unit-tested against a fake that
 * never contacts Google.
 */
export abstract class GoogleIdTokenVerifier {
  abstract verify(idToken: string): Promise<GoogleProfile>;
}

/**
 * Production verifier — checks the One Tap ID token's signature, expiry, and
 * audience against our OAuth client id using Google's library.
 */
@Injectable()
export class GoogleAuthLibraryVerifier extends GoogleIdTokenVerifier {
  private readonly client: OAuth2Client;
  private readonly audience: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.audience = config.get('GOOGLE_CLIENT_ID', { infer: true });
    this.client = new OAuth2Client(this.audience);
  }

  async verify(idToken: string): Promise<GoogleProfile> {
    let payload;
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.audience,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google credential');
    }
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Invalid Google credential');
    }
    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified ?? false,
      name: payload.name ?? undefined,
      picture: payload.picture ?? undefined,
    };
  }
}

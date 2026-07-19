import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { GoogleLoginSchema } from '@rv-checklist/domain';
import { Strategy } from 'passport-custom';
import {
  GoogleIdTokenVerifier,
  type GoogleProfile,
} from '../google-verifier.js';

/**
 * Passport strategy for Google One Tap sign-in (ADR-0002). The browser posts the
 * One Tap credential (a Google ID token) to `POST /auth/google`; this strategy
 * pulls it from the body and verifies it, yielding the asserted
 * {@link GoogleProfile} as the request user. Invalid or missing credentials are
 * rejected as unauthorized.
 */
@Injectable()
export class GoogleIdTokenStrategy extends PassportStrategy(
  Strategy,
  'google-id-token',
) {
  constructor(private readonly verifier: GoogleIdTokenVerifier) {
    super();
  }

  async validate(req: { body: unknown }): Promise<GoogleProfile> {
    const parsed = GoogleLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new UnauthorizedException('Missing Google credential');
    }
    return this.verifier.verify(parsed.data.idToken);
  }
}

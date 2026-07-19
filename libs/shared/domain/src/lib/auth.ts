import { z } from 'zod';

/**
 * Auth wire models (ADR-0002). The browser signs in with Google One Tap, which
 * yields a Google ID token; it posts that token to exchange it for a
 * first-party token pair. Thereafter the short-lived access token is the bearer
 * on every API call and the long-lived refresh token renews it silently, so the
 * owner stays signed in for months (Gmail-like) without ever seeing a login
 * screen.
 */

/** `POST /auth/google` body — the Google One Tap credential (an ID token). */
export const GoogleLoginSchema = z.object({
  idToken: z.string().min(1),
});
export type GoogleLogin = z.infer<typeof GoogleLoginSchema>;

/** `POST /auth/refresh` body — exchanged for a fresh pair; the token rotates. */
export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});
export type Refresh = z.infer<typeof RefreshSchema>;

/**
 * The token pair the API issues. `accessToken` is the bearer for every API call
 * (ADR-0002: stateless resource server). `refreshToken` renews it and rotates
 * on each use. `expiresIn` is the access token's lifetime in seconds — the
 * client refreshes ahead of it.
 */
export const TokenPairSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresIn: z.number().int().positive(),
});
export type TokenPair = z.infer<typeof TokenPairSchema>;

import { z } from 'zod';

/**
 * Auth wire models (ADR-0002, ADR-0019). The browser signs in with Google One
 * Tap, which yields a Google ID token; it posts that token to the API, which
 * responds by setting httpOnly cookies. No tokens appear in the response body.
 */

/** `POST /auth/google` body — the Google One Tap credential (an ID token). */
export const GoogleLoginSchema = z.object({
  idToken: z.string().min(1),
});
export type GoogleLogin = z.infer<typeof GoogleLoginSchema>;

import { z } from 'zod';

/**
 * Environment configuration (issue #13). Every knob the platform needs is read
 * from the environment — OAuth client, first-party JWT signing, and the
 * Postgres connection — so the same build runs locally and in a cluster with no
 * code change (ADR-0001). Secrets live only in a gitignored `.env`; the
 * committed `.env.example` documents the shape.
 *
 * Parsing is strict: the process refuses to boot with a missing or malformed
 * value rather than failing later at the first request.
 */
export const EnvSchema = z.object({
  /** Port the API listens on. */
  PORT: z.coerce.number().int().positive().default(3000),
  /** The web origin allowed through CORS — the browser calls the API directly (ADR-0002). */
  WEB_ORIGIN: z.url().default('http://localhost:4200'),

  /** Google OAuth dev client id — the audience Google ID tokens are verified against. */
  GOOGLE_CLIENT_ID: z.string().min(1),

  /** Secret the first-party access JWT is signed with (HS256). Keep it long and random. */
  JWT_SECRET: z.string().min(16),
  /** Access-token lifetime in seconds. Short — the refresh token keeps the session alive. */
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  /** Refresh-token lifetime in days. Long (Gmail-like) so the owner rarely re-signs-in. */
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(180),

  /**
   * Cookie domain for the httpOnly auth cookies (ADR-0019). In production this
   * is `.rv.<apex>` so both the web host and the API subdomain receive them.
   * Omit or leave empty in development to default to the request host.
   */
  COOKIE_DOMAIN: z.string().optional(),

  /** Postgres connection string — matches the dev Docker Compose service. */
  DATABASE_URL: z.string().min(1),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Validate and coerce the raw environment. Used as the `@nestjs/config`
 * validate hook so a bad `.env` fails fast at bootstrap.
 */
export function validateEnv(source: Record<string, unknown>): Env {
  return EnvSchema.parse(source);
}

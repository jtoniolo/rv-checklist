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

  /**
   * Google OAuth client secret for the server-side authorization code flow
   * used by `@rekog/mcp-nest-auth`. Same Google Cloud console client as
   * GOOGLE_CLIENT_ID, but One Tap (ADR-0002) only needed the id — the MCP
   * OAuth flow (ADR-0024) needs the secret too. Required at boot; the
   * authorize/callback flow that actually uses it ships in #94.
   */
  GOOGLE_CLIENT_SECRET: z.string().min(1),

  /**
   * MCP OAuth 2.1 issuer URL (ADR-0024). Must be a bare origin — no path
   * component — because claude.ai fetches
   * `<issuer>/.well-known/oauth-authorization-server` and breaks if the
   * issuer contains a path.
   */
  MCP_ISSUER_URL: z
    .url()
    .refine((u) => new URL(u).pathname === '/', {
      message: 'MCP_ISSUER_URL must have no path component (bare origin)',
    })
    .default('http://localhost:3000'),

  /**
   * HS256 signing secret for MCP OAuth JWTs (ADR-0024). Separate from the
   * first-party JWT_SECRET so rotating one does not invalidate the other.
   * Must be at least 32 characters.
   */
  MCP_JWT_SECRET: z.string().min(32),

  /**
   * MCP resource URL — the value advertised in RFC 9728 protected-resource
   * metadata. Defaults to `<MCP_ISSUER_URL>/api/mcp`.
   */
  MCP_RESOURCE_URL: z.url().optional(),

  /**
   * Comma-separated allowlist of redirect URIs accepted during dynamic
   * client registration (ADR-0024). Loopback URIs (`http://localhost` and
   * `http://127.0.0.1`, any port, any path) are always accepted regardless
   * of this list.
   */
  MCP_REDIRECT_ALLOWLIST: z
    .string()
    .default(
      'https://claude.ai/api/mcp/auth_callback,https://claude.com/api/mcp/auth_callback',
    ),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Validate and coerce the raw environment. Used as the `@nestjs/config`
 * validate hook so a bad `.env` fails fast at bootstrap.
 */
export function validateEnv(source: Record<string, unknown>): Env {
  return EnvSchema.parse(source);
}

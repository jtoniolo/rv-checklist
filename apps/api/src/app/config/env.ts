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
   * How long, in seconds, a rotated-out refresh token may still be replayed
   * (ADR-0028 amending ADR-0012). On an unreliable network the rotation
   * response can be lost; inside this window the spent token still refreshes,
   * so the session self-heals. Outside it, a spent token is rejected.
   */
  REFRESH_REUSE_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(120),

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
   * Google Maps Platform API key for leg-distance fetches (ADR-0025),
   * scoped to the Routes API and Places API (New), no IP restriction (the
   * home egress IP is dynamic), daily quotas capped inside the free tier.
   * Distinct from the OAuth client above — this is a plain API key, not an
   * OAuth credential. Required at boot; the fetch flow that actually uses
   * it ships with the Trip Planner build.
   */
  GOOGLE_MAPS_API_KEY: z.string().min(1),

  /**
   * Garage S3 endpoint for attachment storage (ADR-0026). Garage runs on the
   * home lab host, outside the cluster, so the same endpoint serves cluster
   * and local dev. Path-style addressing — the S3 client sets
   * `forcePathStyle`.
   */
  S3_ENDPOINT: z.url(),
  /**
   * The app's single attachment bucket (ADR-0026 — one bucket for the whole
   * app; photo fields share it later). `rv-checklist` in production,
   * `rv-checklist-local` for local dev.
   */
  S3_BUCKET: z.string().min(1),
  /** Garage key id for the bucket (provisioned by ticket #110, lives in Vault). */
  S3_ACCESS_KEY_ID: z.string().min(1),
  /** Garage secret key paired with S3_ACCESS_KEY_ID. */
  S3_SECRET_ACCESS_KEY: z.string().min(1),

  /**
   * Shared HS256 key for PowerSync client JWTs (ADR-0028), **base64url**
   * encoded so the API and the sync service derive identical key bytes: the
   * API signs with the decoded bytes, and the same string goes verbatim into
   * the service's inline JWKS as `k` (which JWKS defines as base64url).
   * Generate with:
   * `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
   * Separate from JWT_SECRET / MCP_JWT_SECRET so each rotates independently.
   */
  POWERSYNC_JWT_SECRET: z.string().regex(/^[\w-]{43,}$/, {
    message:
      'POWERSYNC_JWT_SECRET must be base64url (A-Za-z0-9_-), at least 43 chars (~32 bytes)',
  }),

  /**
   * Public origin clients reach the PowerSync sync service at (ADR-0028).
   * `GET /auth/powersync-token` hands it to the client alongside the token
   * (the PowerSync connector's `fetchCredentials` shape). The default matches
   * the dev compose stack.
   */
  POWERSYNC_URL: z.url().default('http://localhost:8080'),

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

  /**
   * Enables `POST /auth/e2e-login` (issue #156): a Google-verification-free
   * sign-in for the offline-charter Playwright suite, which has no headless
   * path through One Tap. Runs the real {@link AuthService.loginWithGoogle}
   * (same cookies, same first-login seeding) against a caller-supplied email
   * instead of a verified Google profile — so it must default to disabled and
   * stay unset in every deployed environment; the chart never sets it.
   */
  E2E_TEST_AUTH: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Validate and coerce the raw environment. Used as the `@nestjs/config`
 * validate hook so a bad `.env` fails fast at bootstrap.
 */
export function validateEnv(source: Record<string, unknown>): Env {
  return EnvSchema.parse(source);
}

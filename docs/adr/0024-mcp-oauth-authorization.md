# 24. MCP OAuth 2.1 authorization

Date: 2026-08-18

## Status

Accepted (amends [ADR-0021](0021-mcp-server-inside-api.md) and
[ADR-0022](0022-mcp-token-lifecycle.md))

## Context

claude.ai and Claude Desktop custom connectors authenticate remote MCP
servers with OAuth; the request-headers beta that let them send a static
token is account-gated and not ours to enable. Wayfinder map #83
(tickets #84–#90) established what OAuth support requires and how it can
coexist with the static `rvmcp_` token:

- claude.ai requires RFC 9728 protected-resource metadata behind a real
  401 `WWW-Authenticate` challenge, RFC 8414/OIDC discovery advertising
  PKCE S256, RFC 8707 audience validation, and dynamic client
  registration (RFC 7591); callbacks land on `claude.ai` and
  `claude.com` (#84).
- GitHub and Linear run dual auth (OAuth discovery + static tokens) on
  one endpoint in production. ADR-0021's "never advertises OAuth" rule
  guarded against a Claude Code regression (v2.1.85–v2.1.140), since
  fixed; current docs give a configured static header precedence (#85).
- Known claude.ai client bugs (refresh not attempted, silent OAuth
  abandon) push toward longer-lived access tokens and clean 401 re-auth
  (#84, #88).

The owner's fixed constraint: the static `rvmcp_` token (ADR-0022) stays
fully functional for Claude Code and the Messages API.

## Decision

- **Authorization server: `@rekog/mcp-nest-auth` (pinned 2.0.1) inside
  the API.** Same vendor and release train as our pinned
  `@rekog/mcp-nest`. Its `McpAuthModule` provides the OAuth 2.1
  authorization server (authorize, token, registration, discovery,
  consent) with the TypeORM store in our existing Postgres and its
  shipped Google federation, reusing the existing Google OAuth client
  with one added redirect URI.
- **Discovery — supersedes ADR-0021's "never advertises OAuth" bullet.**
  The RFC 9728 protected-resource metadata and authorization-server
  metadata routes are public at all times at their well-known paths. The
  `WWW-Authenticate` pointer is attached only to 401 responses, never to
  successful calls. A request with a valid `rvmcp_` token never gets a
  401, so static-token clients never see OAuth. An invalid or revoked
  `rvmcp_`-prefixed token gets a **plain 401 with no OAuth pointer**
  (shields the buggy Claude Code range and makes a mistyped token fail
  loudly); no token or a non-`rvmcp_` bearer gets the standard
  challenge.
- **Client registration: open DCR, no provisioned clients.** Redirect
  URIs are allowlisted: `https://claude.ai/api/mcp/auth_callback`,
  `https://claude.com/api/mcp/auth_callback`, and
  `http://localhost` / `http://127.0.0.1` loopbacks (any port, any
  path) — one config line to extend. Client auth methods `none` and
  `client_secret_post` only; PKCE S256 mandatory for every client.
  Abuse controls: per-IP `@nestjs/throttler` rate limit on the
  registration endpoint, plus a cleanup job deleting client records
  that never received a token after 30 days.
- **Authorize and consent: library-native, existing users only.**
  `/authorize` federates to Google via the library's shipped provider;
  the built-in consent page is explicitly enabled with the default
  30-day remembered approval. The `profileMapper` resolves the Google
  profile to an existing user by email — no auto-create; an unknown
  account aborts with `error=access_denied`. No web-app route is added
  (ADR-0018 untouched); a branded consent template via the `render`
  hook is deferred polish.
- **Tokens.** Access tokens are HS256 JWTs with a **30-day TTL**
  carrying a grant ID claim; every MCP call verifies the JWT and checks
  grant liveness in the database, so revocation is immediate. Refresh
  tokens never expire and rotate on every use; reuse of a spent refresh
  token revokes the whole grant. Token audience is validated per
  RFC 8707. Scopes: a single functional scope `mcp`, plus
  `offline_access` advertised in `scopes_supported` (Claude only
  requests a refresh token when it is advertised). The 30-day TTL is
  the worst-case re-auth interval given claude.ai's refresh bugs.
- **Coexistence — amends ADR-0022.** A composite guard routes by
  prefix: `rvmcp_` tokens take the existing hash check unchanged;
  anything else takes the JWT path. The static token stays
  never-expiring; OAuth grants and the static token are fully
  independent — revoking one never touches the other. ADR-0022's
  lifecycle rules otherwise stand word-for-word.
- **UI — amends ADR-0022's "avatar menu dialog only" stance.** A new
  avatar-menu entry opens a **Connected apps page** listing MCP OAuth
  grants (client name, created, last used, revoke) and **web login
  sessions**: `refresh_tokens` gains a session ID grouping each
  rotation chain, a user-agent captured at login, and last-used.
  Revoking a session revokes the chain; the web session dies at its
  next token refresh (its current short-lived access JWT survives
  until expiry, per ADR-0002 — MCP grants have no such gap because of
  the per-call grant check). The MCP Token dialog is unchanged.

## Alternatives considered

- **Official SDK `mcpAuthRouter` / `ProxyOAuthServerProvider`** —
  rejected: in SDK v2 these live in a frozen legacy shim whose own
  deprecation notice says to use a dedicated OAuth server.
- **node-oidc-provider** — runner-up: most mature, but Koa-mounted
  outside Nest guards/DI, all login/consent UI custom, no MCP-specific
  metadata; overkill for one resource and one IdP.
- **better-auth `mcp()` plugin** — rejected: a whole parallel auth
  framework with its own user/session tables beside our hand-rolled
  auth.
- **Hand-rolled authorization server** — rejected: ADR-0021 already
  sized it at 5–10× the work.
- **Provisioned clients instead of open DCR** — rejected: claude.ai
  registers a new client per connection, so this would force manual
  client-ID entry on every device. Registration alone grants nothing —
  a token still requires the owner's Google sign-in plus consent.
- **Short-lived access tokens** — rejected: claude.ai sometimes never
  refreshes, so a short TTL silently kills idle connections; the
  per-call grant check restores immediate revocation instead.
- **Separate OAuth-only endpoint path** — rejected: no production
  precedent; dual auth on one endpoint is the GitHub/Linear pattern.

## Consequences

- Claude Code and Messages API clients see no change; claude.ai and
  Claude Desktop connect as custom connectors with no token paste and
  no request-headers beta.
- New Postgres tables via the library's TypeORM store migration; new
  columns (session ID, user agent, last used) on `refresh_tokens`;
  `cookie-parser` joins the API middleware.
- The grant-liveness check and per-call `last_used_at` update slot into
  the same composite guard that routes `rvmcp_` tokens and maps users.
- The dependency is young (2.0.1) and single-vendor — accepted because
  it is the vendor already pinned for the MCP transport.
- `docs/mcp.md` is rewritten at implementation: claude.ai / Desktop via
  OAuth connector, Claude Code and Messages API instructions unchanged.

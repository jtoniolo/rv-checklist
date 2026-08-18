# OAuth 2.1 Authorization Server Options for the NestJS API

**Scope:** Ways to add an OAuth 2.1 authorization server to the existing NestJS API so MCP clients can authorize via OAuth instead of (or beside) the static `rvmcp_` token. Context: ADR-0021 (MCP via `@rekog/mcp-nest` 2.0.1, single stateless `POST /api/mcp` endpoint), existing JWT `TokenService`, Google login, `McpAuthGuard`, TypeORM + PostgreSQL.

**Date compiled:** 2026-08-18 (wayfinder ticket #86, map #83)

**Source-priority note:** All claims cite primary sources — each project's own README, docs, source code, or npm registry metadata. No blog posts or third-party tutorials.

**What "authorization server" means here:** the party that serves the `/authorize` and `/token` endpoints, registers clients (DCR per RFC 7591 or Client ID Metadata Documents), enforces PKCE, publishes RFC 8414 authorization-server metadata, and shows a consent page. The MCP endpoint itself is the *resource server*: it validates access tokens and publishes RFC 9728 protected-resource metadata.

---

## Summary table

| # | Option | Current version | Maturity | Free | Stays custom | Fit | Verdict |
|---|--------|-----------------|----------|------|--------------|-----|---------|
| a | Official TS SDK `mcpAuthRouter` / `ProxyOAuthServerProvider` | `@modelcontextprotocol/server-legacy` 2.0.0 | **Frozen legacy shim**, explicitly deprecated | authorize/token/register handlers, bearer middleware | clients store, consent, Nest mounting | Poor — dead end on the SDK v2 line we already use | Ruled out |
| b | `@rekog/mcp-nest-auth` (`McpAuthModule`) | 2.0.1 (lockstep with our pinned `@rekog/mcp-nest` 2.0.1) | New (v2 line) but same vendor as our MCP integration; MCP-auth-spec 2025-06-18 compliant | Full OAuth 2.1 AS: authorize, token, DCR, CIMD, PKCE S256 mandatory, RFC 8414 + RFC 9728 discovery, consent page, TypeORM store, Google federation, JWT guard | Google→local-user mapping, store migration, ADR-0021 revision | **Excellent** — Nest module, TypeORM+pg already present, Google already the IdP, stateless token check | **Recommended** |
| c | `node-oidc-provider` | 9.11.3, actively maintained | Highest — OpenID-certified (Basic/FAPI 1.0/FAPI 2.0) | Every OAuth/OIDC spec incl. PKCE, RFC 7591 DCR, RFC 8414 | Adapter (storage), *all* interaction UI (login + consent), Koa-in-Nest mounting, RFC 9728 resource metadata, MCP-spec details (CIMD) | Moderate — heavyweight, framework-foreign | Runner-up |
| d | better-auth `mcp()` plugin | better-auth 1.7.0 | Active, large project | OAuth 2.1 authorize/token, opt-in DCR, CIMD, RFC 8414 + RFC 9728, JWKS | Login page, consent page, its own DB tables, MCP route wiring; parallel auth framework beside our hand-rolled auth | Poor — competing framework, duplicate user/session model | Ruled out |
| e | Hand-rolled on `TokenService` | n/a | n/a | Nothing beyond JWT signing | authorize, token, PKCE, DCR/CIMD, discovery, consent, client+code storage, security review | Full control but ~5–10× effort (ADR-0021's own estimate) | Ruled out |

---

## Option details

### (a) Official TypeScript MCP SDK: `mcpAuthRouter` + `ProxyOAuthServerProvider`

- These helpers exist, but in SDK v2 they live in the **`@modelcontextprotocol/server-legacy`** package, described on npm as "Frozen v1 SSE transport and OAuth Authorization Server helpers … for migration purposes only. Use StreamableHTTP from `@modelcontextprotocol/server` and a dedicated OAuth server in production. Will not receive new features." ([npm: @modelcontextprotocol/server-legacy](https://www.npmjs.com/package/@modelcontextprotocol/server-legacy), [registry metadata](https://registry.npmjs.org/@modelcontextprotocol/server-legacy/latest))
- The v2 API reference confirms `mcpAuthRouter`, `ProxyOAuthServerProvider`, and the authorize/token/register handlers are all under the legacy namespace; the non-legacy v2 server package ships only resource-server middleware (`bearerAuth`, `oauthMetadata`). ([SDK v2 API docs](https://ts.sdk.modelcontextprotocol.io/v2/api/@modelcontextprotocol/server-legacy/auth.html), [v2 docs index](https://ts.sdk.modelcontextprotocol.io/v2/))
- Even when it was current, the implementer supplied the `OAuthRegisteredClientsStore`, code/token persistence, and consent UI; it is an Express router that we would hand-mount inside Nest — the exact wiring ADR-0021 already rejected for the transport. ([SDK v2 API docs, auth module](https://ts.sdk.modelcontextprotocol.io/v2/api/@modelcontextprotocol/server-legacy/auth.html))
- **Verdict:** ruled out. We are on the SDK v2 line (via `@rekog/mcp-nest` 2.0.1, peer-depending on `@modelcontextprotocol/*` ^2.0.0 — [registry metadata](https://registry.npmjs.org/@rekog/mcp-nest/latest)); building new auth on a frozen legacy shim is a maintenance dead end, and the SDK's own deprecation notice says to use a dedicated OAuth server instead.

### (b) `@rekog/mcp-nest-auth` — the built-in authorization server of our MCP library

- Separate optional package from the same vendor as our pinned MCP integration: `@rekog/mcp-nest-auth` 2.0.1, "OAuth 2.1 authorization server for @rekog/mcp-nest — MCP-authorization-spec compliant, federates to GitHub/Google/Azure AD". Peer-depends on `@rekog/mcp-nest` >=2.0.0 and optionally `typeorm` / `@nestjs/typeorm`. ([npm registry metadata](https://registry.npmjs.org/@rekog/mcp-nest-auth/latest))
- **Free:** `McpAuthModule` is a complete OAuth 2.1 identity provider implementing the MCP Authorization spec (revision 2025-06-18):
  - Endpoints: `/authorize` (PKCE `S256` mandatory, advertised as the only method; `requirePkce: false` exists but logs a warning), `/token` (access + optional refresh tokens), `/callback`, `/register` (RFC 7591 DCR — deprecated by MCP revision 2026-07-28 but fully supported, disableable), and an optional `/consent` page. ([docs/built-in-authorization-server.md](https://github.com/rekog-labs/MCP-Nest/blob/main/docs/built-in-authorization-server.md))
  - Discovery: `/.well-known/oauth-authorization-server` (RFC 8414) and `/.well-known/oauth-protected-resource` (RFC 9728). (same doc)
  - **CIMD** (Client ID Metadata Documents), the 2026-07-28 successor to DCR, with SSRF mitigation (publicly-routable address pinning, `Accept-Encoding: identity`, size cap, LRU cache). (same doc)
  - Built-in consent screen showing client name, signed-in user, and redirect-URI host, with (user, client, scope) approvals remembered up to 30 days. (same doc)
  - Storage: in-memory (dev), **TypeORM** (Postgres et al.), or a custom `IOAuthStore`. ([source: oauth-provider.interface.ts, `StoreConfiguration`](https://github.com/rekog-labs/MCP-Nest/blob/main/packages/mcp-nest-auth/src/providers/oauth-provider.interface.ts))
  - Resource-server side: `McpAuthJwtGuard` accepts a Bearer token only if HS256-signed with `jwtSecret`, unexpired, issued by `jwtIssuer`, audienced at the configured `resource`, and of `type: 'access'` — a **stateless** check, matching our stateless endpoint. Per-tool `@ToolScopes()` / `@PublicTool()` decorators and `@McpUser()` injection. ([docs/built-in-authorization-server.md](https://github.com/rekog-labs/MCP-Nest/blob/main/docs/built-in-authorization-server.md))
  - End-user login federates to an external IdP — a shipped `GoogleOAuthProvider` (passport-google-oauth20) is included, so users sign in with the same Google identity our existing login uses. ([source: google.provider.ts](https://github.com/rekog-labs/MCP-Nest/blob/main/packages/mcp-nest-auth/src/providers/google.provider.ts))
- **Stays custom:**
  - Mapping the Google profile to our existing `users` row. The provider config exposes a `profileMapper: (profile) => OAuthUserProfile` hook ([oauth-provider.interface.ts](https://github.com/rekog-labs/MCP-Nest/blob/main/packages/mcp-nest-auth/src/providers/oauth-provider.interface.ts)); the issued token carries that profile (email), so a thin wrapper around `McpAuthJwtGuard` — or a custom composite guard — resolves the local user by email exactly as `McpAuthGuard` does today (`apps/api/src/app/auth/mcp-auth.guard.ts` sets `req.user` to the Owner shape).
  - A TypeORM migration for the OAuth store entities, a second Google OAuth client (or reuse of the existing one with an added redirect URI), `jwtSecret` config, and `cookie-parser` middleware (the module "fails at boot" without it — [docs](https://github.com/rekog-labs/MCP-Nest/blob/main/docs/built-in-authorization-server.md)).
  - Guard composition so the endpoint accepts **either** an OAuth access token **or** the static `rvmcp_` token, and a revision of ADR-0021's "the endpoint never advertises OAuth" clause (adding OAuth is exactly the "new decision with real scope" that ADR anticipated — `docs/adr/0021-mcp-server-inside-api.md`).
- **Risks:** the package is young (2.0.1, released in lockstep with `mcp-nest` v2) and single-vendor. Mitigation: it is the same vendor and release train we already pinned for the MCP transport (ADR-0021), so the coupling adds no new supplier.

### (c) `node-oidc-provider`

- Version 9.11.3, MIT, actively maintained by panva ("Version 9.x is under active development and maintenance", trusted-publisher releases). ([npm registry metadata](https://registry.npmjs.org/oidc-provider/latest), [README](https://github.com/panva/node-oidc-provider))
- **Maturity is the best of any option:** OpenID-certified (Basic, Implicit, Hybrid, FAPI 1.0, FAPI CIBA, FAPI 2.0) and implements essentially every relevant RFC: PKCE (7636), DCR (7591/7592), AS metadata (8414), resource indicators (8707), JWT access tokens (9068), PAR, DPoP, and more. ([README certification and specs list](https://github.com/panva/node-oidc-provider))
- **Free:** all protocol endpoints and metadata above.
- **Stays custom:** a persistence **adapter** (clients, codes, tokens — the default is in-memory), and the **entire interaction layer** — login and consent pages are explicitly your code ([README](https://github.com/panva/node-oidc-provider), [docs: user flows/interactions](https://github.com/panva/node-oidc-provider/blob/main/docs/README.md)). It is a **Koa** application (`koa` ^3 is a hard dependency — [registry metadata](https://registry.npmjs.org/oidc-provider/latest)) that "can be mounted to existing connect, express, fastify, hapi, or koa applications" ([README](https://github.com/panva/node-oidc-provider)) — in Nest that means mounting a foreign callback outside the guard/DI system. It also knows nothing about MCP: RFC 9728 protected-resource metadata on the MCP side and CIMD would still be ours to add (mcp-nest's external-AS mode can supply the resource-side metadata and JWKS validation — [docs/external-authorization-server.md](https://github.com/rekog-labs/MCP-Nest/blob/main/docs/external-authorization-server.md)).
- **Verdict:** the credible runner-up. Right choice if we ever need a certified, multi-client OIDC provider; overkill for one MCP resource with one social IdP, and the highest custom-UI and integration burden after hand-rolling.

### (d) better-auth `mcp()` plugin

- better-auth 1.7.0, "the most comprehensive authentication framework for TypeScript", active. ([npm registry metadata](https://registry.npmjs.org/better-auth/latest))
- **Free:** the `mcp()` plugin turns a better-auth server into an OAuth 2.1 provider for MCP clients: `/oauth2/authorize`, `/oauth2/token`, optional `/oauth2/register` (DCR is opt-in), CIMD as the recommended client-identity mechanism, RFC 8414 + RFC 9728 metadata, resource-bound access tokens, and a `requireMcpAuth` wrapper that verifies tokens against the JWKS. ([better-auth MCP plugin docs](https://www.better-auth.com/docs/plugins/mcp))
- **Stays custom:** login page, consent page, the MCP route wiring, and a database migration for better-auth's own tables (`oauthClient`, `oauthAccessToken`, …); the JWT plugin is mandatory. ([same docs](https://www.better-auth.com/docs/plugins/mcp))
- **Fit:** poor. better-auth is a full auth *framework* with its own user/session/account schema and route handler. Our API has hand-rolled auth (Google verify + `TokenService` + refresh-token store, ADR-0002/0019); adopting better-auth only for MCP means running a second, parallel identity system with duplicate user records, or migrating all auth to it — far beyond this ticket's scope.

### (e) Hand-rolled endpoints reusing `TokenService`

- **Free:** only JWT minting/verification (`apps/api/src/app/auth/token.service.ts`) and the Google login flow.
- **Stays custom — i.e., everything:** `/authorize` with PKCE S256 verification, `/token` with code exchange and rotation, client registration (DCR and/or CIMD with its SSRF pitfalls), RFC 8414 + RFC 9728 metadata documents, a consent page, and storage for clients/codes/consent — plus getting the security details right (redirect-URI exact matching, code single-use, audience binding). The MCP spec's authorization requirements are non-trivial and moving (DCR deprecated in favor of CIMD in revision 2026-07-28 — [MCP-Nest source comment citing spec PR #2858](https://github.com/rekog-labs/MCP-Nest/blob/main/packages/mcp-nest-auth/src/providers/oauth-provider.interface.ts)).
- ADR-0021 already sized this at "roughly 5–10× the work" of the static token (`docs/adr/0021-mcp-server-inside-api.md`). With option (b) available from the vendor we already depend on, hand-rolling buys nothing but audit burden.

---

## Recommendation

**Use `@rekog/mcp-nest-auth` (`McpAuthModule`) with the TypeORM store and the Google provider.**

Reasons, in order:

1. **It is the only option that is a NestJS module** — guards, DI, and controllers, the same integration style ADR-0021 chose the transport for. Everything else is an Express/Koa router or a competing framework mounted around Nest.
2. **Everything MCP-specific is free**: OAuth 2.1 with mandatory PKCE S256, RFC 8414 + RFC 9728 discovery, DCR *and* CIMD (tracking the 2026-07-28 spec change), a consent page, and a stateless HS256 access-token guard — the endpoint stays sessionless.
3. **Our stack already matches its requirements**: TypeORM + Postgres for the store, Google as the IdP, `@rekog/mcp-nest` 2.0.1 as the peer it extends.
4. **The remaining custom work is small and local**: a `profileMapper`/guard shim to resolve the Google email to our user row (mirroring `McpAuthGuard`), a store migration, `cookie-parser`, a composite guard keeping the static `rvmcp_` token working, and an ADR superseding ADR-0021's "never advertises OAuth" clause.

Runner-up: **node-oidc-provider** — choose it only if requirements grow beyond one MCP resource (multiple first-party clients, certification needs); it is the most mature but the most foreign to the stack and leaves all UI plus the MCP-specific metadata custom. The official SDK's auth helpers are frozen legacy code by the SDK's own deprecation notice; better-auth drags in a parallel auth framework; hand-rolling repeats work the same-vendor package already did.

---

## Sources

- MCP TypeScript SDK v2 docs — https://ts.sdk.modelcontextprotocol.io/v2/ and https://ts.sdk.modelcontextprotocol.io/v2/api/@modelcontextprotocol/server-legacy/auth.html
- npm: `@modelcontextprotocol/server-legacy` (deprecation notice) — https://www.npmjs.com/package/@modelcontextprotocol/server-legacy
- MCP-Nest repo — https://github.com/rekog-labs/MCP-Nest (README, `docs/built-in-authorization-server.md`, `docs/external-authorization-server.md`, `packages/mcp-nest-auth/src/providers/*.ts`)
- npm: `@rekog/mcp-nest`, `@rekog/mcp-nest-auth` — https://registry.npmjs.org/@rekog/mcp-nest/latest, https://registry.npmjs.org/@rekog/mcp-nest-auth/latest
- node-oidc-provider — https://github.com/panva/node-oidc-provider and https://registry.npmjs.org/oidc-provider/latest
- better-auth MCP plugin docs — https://www.better-auth.com/docs/plugins/mcp and https://registry.npmjs.org/better-auth/latest
- In-repo: `docs/adr/0021-mcp-server-inside-api.md`, `apps/api/src/app/auth/token.service.ts`, `apps/api/src/app/auth/mcp-auth.guard.ts`, `apps/api/src/app/mcp/mcp.module.ts`, `apps/api/package.json`

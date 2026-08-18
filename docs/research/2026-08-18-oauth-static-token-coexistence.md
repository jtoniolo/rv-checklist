# OAuth Discovery Metadata and Static `rvmcp_` Bearer Tokens: Can They Coexist Across Claude Clients?

**Scope:** Whether a remote MCP server can serve OAuth discovery metadata (RFC 9728 protected resource metadata, `WWW-Authenticate` on 401) **and** keep accepting static `rvmcp_` bearer tokens, without breaking any Claude client (Claude Code, Claude Desktop, claude.ai, Messages API MCP connector). Re-verifies the claim behind ADR-0021's "never advertise OAuth" rule: that Claude Code ignores a configured static token when the server advertises OAuth.

**Date compiled:** 2026-08-18 (wayfinder ticket #85, map #83; feeds the discovery-serving-strategy decision in #90)

**Source-priority note:** This document prioritizes (1) the MCP authorization specification (modelcontextprotocol.io), (2) Anthropic's own current client documentation (code.claude.com, claude.com/docs/connectors, platform.claude.com), (3) live HTTP probes of production dual-auth MCP servers (GitHub, Linear, Sentry) run on 2026-08-18 as part of this research, (4) vendor documentation for those servers, and (5) `anthropics/claude-code` GitHub issues for observed (buggy) behavior. Issue reports describe specific client versions and are treated as evidence of *past* behavior, not current spec; current Anthropic docs win where they conflict.

---

## Answer

**Yes — with one caveat about old Claude Code versions.** A remote MCP server can serve full OAuth discovery metadata and still accept static bearer tokens on the same endpoint. This is exactly how GitHub's and Linear's production MCP servers operate today, and Anthropic's own Claude Code documentation uses GitHub's OAuth-advertising server as its worked example for static-header authentication. Current (2026) Claude Code documents header-takes-precedence semantics: a configured `headers.Authorization` is used, and if the server rejects it the connection is reported **failed** — it does *not* fall back to OAuth.

The behavior ADR-0021 relied on **was real, but was a regression, not a design**: Claude Code versions from roughly v2.1.85 through at least v2.1.140 (March–May 2026) had a bug class where OAuth discovery state could preempt or permanently poison a configured static header. It is tracked as closed-duplicate chains in `anthropics/claude-code` and contradicts the current documented behavior.

Practical consequence for rv-checklist: the ADR-0021 ban costs nothing today (we run no authorization server, so there is nothing truthful to advertise — RFC 9728 metadata *must* name at least one authorization server). If OAuth is added later, dual-auth is viable, with the mitigations in the last section.

---

## 1. What "advertising OAuth" means in the MCP spec

Source: [MCP Authorization specification (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)

- Authorization is **OPTIONAL** for MCP implementations. A server that only accepts static tokens is not violating the spec; it is simply not implementing the spec's authorization layer.
- When a server *does* implement spec authorization, discovery works like this:
  1. Client sends a request; server returns **401 with a `WWW-Authenticate` header** whose `resource_metadata` parameter points at an RFC 9728 protected resource metadata (PRM) document. "MCP servers **MUST** use the HTTP header `WWW-Authenticate` when returning a *401 Unauthorized*."
  2. Client fetches the PRM document (`/.well-known/oauth-protected-resource[...]`), which "**MUST** include the `authorization_servers` field containing at least one authorization server."
  3. Client fetches RFC 8414 authorization server metadata from that authorization server, then runs the OAuth 2.1 + PKCE flow (with Dynamic Client Registration or CIMD).
- Two structural facts matter for the coexistence question:
  - **`WWW-Authenticate` only ever appears on a 401.** A request that succeeds with a static token never surfaces discovery. "Discovery only on unauthenticated 401s" is therefore mostly the spec's own shape, not an exotic mitigation.
  - **You cannot advertise OAuth without a real authorization server.** The PRM document must name one. A server with only static tokens has nothing valid to serve, so ADR-0021's "no discovery routes" stance is currently the only truthful option — independent of client bugs.

## 2. Claude Code: current documented behavior (2026)

Source: [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp) (fetched 2026-08-18)

- Static headers are a first-class auth path: `claude mcp add --transport http <name> <url> --header "Authorization: Bearer your-token"`, plus `headers` / `headersHelper` in `.mcp.json`.
- The load-bearing sentence, quoted verbatim:

  > "If you configured `headers.Authorization` for the server and the server rejects that header, Claude Code reports the connection as failed instead of falling back to OAuth. Check that the token is valid for the MCP endpoint, or remove the header to use the OAuth flow."

  I.e., a configured static `Authorization` header **takes precedence over server-advertised OAuth**, including on rejection.
- The docs' own worked example is a dual-auth, OAuth-advertising server used with a static token: "GitHub's remote MCP server authenticates with a GitHub personal access token passed as a header" — `claude mcp add --transport http github https://api.githubcopilot.com/mcp/ --header "Authorization: Bearer YOUR_GITHUB_PAT"`. (Section 4 below shows that this exact server always serves OAuth discovery.) If advertising OAuth broke static headers in current Claude Code, Anthropic's flagship example would not work.
- OAuth discovery is 401-triggered: "A custom server that returns a `WWW-Authenticate` header pointing to its authorization server gets the same automatic discovery as any other remote server." Claude Code's discovery chain is RFC 9728 PRM first, then RFC 8414 fallback, overridable per server with `oauth.authServerMetadataUrl`.

## 3. The bug ADR-0021 cited: real, a regression, and (per docs) resolved

The claim "Claude Code may ignore a configured static token if the server advertises OAuth" traces to a cluster of `anthropics/claude-code` issues:

- [#33817](https://github.com/anthropics/claude-code/issues/33817) (opened 2026-03-13, v2.1.74): "MCP Server Authorization Header Not Recognized, Falls Back to OAuth." Reporter notes it **worked the day before** — i.e., a regression. Closed as duplicate.
- [#44774](https://github.com/anthropics/claude-code/issues/44774): "headersHelper silently ignored since v2.1.85 — Claude Code skips to OAuth discovery instead." Root-cause analysis in the issue: the regression came in with Claude Code's **RFC 9728 OAuth discovery changes in v2.1.85** (v2.1.81 works). A single transient headersHelper failure → 401 → OAuth discovery runs and is **cached** (macOS keychain / `~/.claude/mcp-needs-auth-cache.json`) → on later startups a `hasMcpDiscoveryButNoToken()` check skips the header path entirely, permanently. Workaround recorded in the issue: `security delete-generic-password -s "Claude Code-credentials"` and `rm ~/.claude/mcp-needs-auth-cache.json`. Marked duplicate of [#41690](https://github.com/anthropics/claude-code/issues/41690) (closed duplicate 2026-04-04).
- [#59467](https://github.com/anthropics/claude-code/issues/59467) (v2.1.140, closed as duplicate 2026-05-19): "HTTP MCP client ignores configured Authorization header when server also advertises OAuth" — valid Supabase PAT in `headers`, server connects but exposes only auto-generated `authenticate`/`complete_authentication` tools; the same PAT works via `curl`. Auto-closed as duplicate of [#41664](https://github.com/anthropics/claude-code/issues/41664), which a maintainer in turn consolidated (2026-05-23) into [#3273](https://github.com/anthropics/claude-code/issues/3273) ("HTTP MCP OAuth dead-ends when server lacks DCR").
- [#38972](https://github.com/anthropics/claude-code/issues/38972): cosmetic variant — static-bearer server works (tools load) but `/mcp` shows "needs authentication."

Assessment: between v2.1.85 and at least v2.1.140 (March–May 2026), server-advertised OAuth **could** divert or poison a configured static header, exactly as ADR-0021 recorded. The current documentation (Section 2) specifies the opposite — header precedence, hard failure instead of OAuth fallback — and documents the GitHub PAT-header pattern as supported, so on up-to-date Claude Code the coexistence pattern is officially sanctioned. Residual risk: users pinned to the buggy version range, and the cached-discovery poisoning path if the server 401s a request that *should* have carried a valid header (mitigations below).

## 4. How production dual-auth MCP servers do it (probed 2026-08-18)

Live probes run for this ticket (HTTP requests against the public endpoints; `initialize` only):

**GitHub — `https://api.githubcopilot.com/mcp/`** ([announcement: supports both OAuth 2.0 and PATs](https://github.blog/changelog/2025-06-12-remote-github-mcp-server-is-now-available-in-public-preview/), [github/github-mcp-server](https://github.com/github/github-mcp-server)):

- No token → `401` with `WWW-Authenticate: Bearer error="invalid_request", error_description="No access token was provided in this request", resource_metadata="https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/"`.
- The PRM document at that (path-suffixed) well-known URL is **always served** (the root `/.well-known/oauth-protected-resource` is a 404): `{"resource":"https://api.githubcopilot.com/mcp/","authorization_servers":["https://github.com/login/oauth"], ...,"bearer_methods_supported":["header"]}`.
- Invalid static token → `401` with `WWW-Authenticate: Bearer error="invalid_token", ..., resource_metadata=...` (discovery still attached).
- **Valid static token (a plain `gh` OAuth/PAT-style token, not an MCP-flow token) → `initialize` succeeds.** Same endpoint, discovery fully advertised, static bearer accepted.

**Linear — `https://mcp.linear.app/mcp`** ([Linear MCP docs](https://linear.app/docs/mcp)):

- No token → `401` with `WWW-Authenticate: Bearer realm="OAuth", resource_metadata="https://mcp.linear.app/.well-known/oauth-protected-resource/mcp", error="invalid_token", error_description="Missing or invalid access token"`.
- Docs: interactive setup "uses OAuth 2.1 with dynamic client registration," **or** "authenticate directly with a bearer token or Linear API key" via `Authorization: Bearer <token>`. Dual-auth on one discovery-advertising endpoint.

**Sentry — `https://mcp.sentry.dev/mcp`** ([Sentry MCP docs](https://mcp.sentry.dev/)):

- Same 401 + `WWW-Authenticate` + `resource_metadata` shape, but the docs state "All connections use OAuth" — included here as the contrast case: OAuth-advertising, not dual-auth.

Common pattern in the dual-auth servers: **one endpoint; validate whatever bearer token arrives (OAuth access token or PAT/API key); attach `WWW-Authenticate` + discovery only to 401 responses; serve the PRM well-known route unconditionally.** None of them serve discovery conditionally on "no token present," and none use separate paths per auth type.

## 5. Other Claude clients

**claude.ai / Claude Desktop / mobile / Cowork connectors** — Source: [Authentication for connectors](https://claude.com/docs/connectors/building/authentication):

- Supported auth types include OAuth (DCR, CIMD, Anthropic-held credentials), `none`, and **`static_headers` (beta)**: "Static bearer tokens and API keys are supported in beta through request headers... An organization administrator enters the credential once when adding the connector, and Claude sends it on every request."
- Discovery is strictly 401-gated: "**The `401` status is required — Claude does not honor a `WWW-Authenticate` header on a `200` response.**" With `static_headers` configured, every request carries the credential, the server never returns 401, and no OAuth flow can start — advertised discovery is inert for these connectors.
- Note: even without a `resource_metadata` pointer, Claude probes `/.well-known/oauth-protected-resource/<mcp-path>` then the root as a fallback during OAuth connection attempts. So "don't serve the well-known route" only changes behavior for connectors added *without* static headers (they fail either way when no authorization server exists — with discovery absent it's "Couldn't reach the MCP server" style failure rather than a half-started OAuth flow).

**Messages API MCP connector** — Source: [MCP connector docs](https://platform.claude.com/docs/en/agents-and-tools/mcp-connector):

- `authorization_token` in the `mcp_servers` entry is sent as the bearer token on every request. "API consumers are expected to handle the OAuth flow and obtain the access token prior to making the API call." The connector **never performs discovery or an OAuth flow itself**, so a server advertising OAuth cannot divert it. A static `rvmcp_` token in `authorization_token` is indistinguishable from an OAuth access token from the connector's point of view.

## 6. Mitigations, ranked

1. **Validate the static token first; never 401 a request bearing a valid token.** All client-side OAuth diversion (including the Claude Code v2.1.85+ poisoning bug in [#44774](https://github.com/anthropics/claude-code/issues/44774)) starts from a 401. If valid-token requests always succeed, advertised discovery is unreachable for correctly configured static-token clients. This is the GitHub/Linear pattern.
2. **Attach `WWW-Authenticate` + `resource_metadata` only to 401 responses** (spec-required shape anyway, per [the MCP authorization spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)); serve the PRM well-known route always-on. Conditional PRM ("only serve `/.well-known/...` when the caller has no token") buys nothing: clients only fetch it mid-OAuth-flow, which only starts after a 401, and claude.ai probes it with unauthenticated GETs regardless.
3. **Refinement for buggy/old Claude Code versions: omit discovery from `invalid_token` 401s** (i.e., only advertise on 401s where *no* `Authorization` header was presented). Diverges from GitHub/Linear (both attach discovery to invalid-token 401s) and from RFC 9728's intent, but it prevents an expired/mistyped static token from ever exposing discovery to a client in the v2.1.85–v2.1.140 regression range. Cheap and harmless server-side.
4. **Client-side levers** (document for users, don't rely on): Claude Code header precedence (Section 2); `oauth.authServerMetadataUrl` and `oauth.scopes` overrides; poisoned-cache recovery from [#44774](https://github.com/anthropics/claude-code/issues/44774) (`security delete-generic-password -s "Claude Code-credentials"`; `rm ~/.claude/mcp-needs-auth-cache.json`); claude.ai `static_headers` beta for org connectors; `authorization_token` for the API connector.
5. **Separate paths** (e.g., `/api/mcp` static-only + `/api/mcp-oauth` advertising): maximal isolation, but no production precedent among the surveyed servers, and it forks the endpoint contract (canonical `resource` URI, docs, client configs). Not recommended unless a client bug of class #44774 recurs and cannot be mitigated by 1–3.

## 7. Recommendation for the discovery-serving-strategy decision (#90)

- **Today (static tokens only, no authorization server): keep ADR-0021's no-discovery rule.** It is not merely a bug workaround — with no authorization server there is nothing truthful to put in `authorization_servers`, so serving discovery would be a lie that sends OAuth-capable clients into a dead-end flow ([Claude Code #3273](https://github.com/anthropics/claude-code/issues/3273) shows how those dead-ends present).
- **If/when OAuth is added: dual-auth on one endpoint is safe and production-proven.** Adopt mitigations 1–3: token-validation-first, 401-only `WWW-Authenticate`, always-on PRM, and optionally suppress discovery on `invalid_token` 401s to shield old Claude Code versions. ADR-0021's "endpoint never advertises OAuth" bullet should then be superseded by a new ADR recording this strategy; its stated rationale (Claude Code diverts static-token clients) describes a fixed regression, not current client behavior.

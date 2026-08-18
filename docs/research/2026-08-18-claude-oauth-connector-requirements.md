# What an OAuth-Protected Remote MCP Server Must Implement for claude.ai / Claude Desktop Custom Connectors

**Scope:** Exact server-side requirements for a remote MCP server so that claude.ai (web) and Claude Desktop custom connectors can complete OAuth, attach tokens, and stay connected. Covers mandatory RFCs, Claude's redirect URIs, manual Client ID/Secret vs. dynamic client registration (DCR), token refresh, scope handling, and known client bugs that constrain server design.

**Date compiled:** 2026-08-18

**Source-priority note:** Primary sources only: (1) the MCP authorization specification at modelcontextprotocol.io (current revision **2025-11-25**; the prior 2025-06-18 revision is noted where Claude's behavior still tracks it), (2) Anthropic's official connector documentation on claude.com/docs and help-center articles on support.claude.com, (3) first-party issue reports and Anthropic-staff responses in github.com/anthropics/claude-ai-mcp. No blog write-ups were used. Every claim cites the source that owns it.

**Issue:** [#84](https://github.com/jtoniolo/rv-checklist/issues/84) (map [#83](https://github.com/jtoniolo/rv-checklist/issues/83))

---

## Summary: the minimum viable server

| # | Requirement | Level | Owner source |
|---|-------------|-------|--------------|
| 1 | Return **HTTP 401** (not a tool error, not 200) with `WWW-Authenticate: Bearer resource_metadata="…"` on unauthenticated MCP requests | MUST | [MCP spec][spec-auth], [Anthropic auth doc][auth-doc] |
| 2 | Serve **RFC 9728 Protected Resource Metadata** with `authorization_servers` (Claude uses only the **first** entry) and `resource` matching the connector URL exactly as entered | MUST | [MCP spec][spec-auth], [Anthropic auth doc][auth-doc] |
| 3 | Authorization server serves **RFC 8414** metadata or **OIDC Discovery** at its `/.well-known/` paths | MUST (at least one) | [MCP spec][spec-auth] |
| 4 | Advertise **`code_challenge_methods_supported: ["S256"]`** and accept PKCE S256 on every authorization request | MUST | [MCP spec][spec-auth], [Anthropic auth doc][auth-doc] |
| 5 | Support a registration path Claude can use: **RFC 7591 DCR** (out of the box), **CIMD**, **manual client ID/secret**, or Anthropic-held credentials | MUST (one of) | [Anthropic auth doc][auth-doc] |
| 6 | Accept redirect URI **`https://claude.ai/api/mcp/auth_callback`** (web, Desktop, mobile, Cowork); issue reports also show a `https://claude.com/api/mcp/auth_callback` form — register both | MUST | [Anthropic auth doc][auth-doc], [issue #632][i632] |
| 7 | Accept the **RFC 8707 `resource`** parameter (Claude/MCP clients always send it) and **validate token audience** | MUST (validate); AS MAY ignore the parameter | [MCP spec][spec-auth] |
| 8 | Token endpoint accepts **`application/x-www-form-urlencoded`**; `/register` accepts JSON; respond within **10 s** (30 s for refresh) | MUST | [Anthropic auth doc][auth-doc] |
| 9 | Issue refresh tokens (list **`offline_access`** in `scopes_supported` if your AS gates on it), rotate them for public clients, return `invalid_grant` when dead | SHOULD/MUST | [Anthropic auth doc][auth-doc], [MCP spec][spec-auth] |
| 10 | Be reachable from Anthropic egress **`160.79.104.0/21`** — MCP host *and* authorization-server host | MUST | [Anthropic auth doc][auth-doc], [help center][hc-connectors] |

---

## 1. Spec baseline — MCP authorization spec, revision 2025-11-25

Source: [MCP Authorization, 2025-11-25][spec-auth] (current); [2025-06-18 revision][spec-auth-0618] for comparison.

The MCP server is an **OAuth 2.1 resource server**; the authorization server (AS) may be co-hosted or external.

### RFC-by-RFC status

| RFC | Role | 2025-11-25 status |
|-----|------|-------------------|
| **RFC 9728** Protected Resource Metadata | MCP server advertises its AS | Server **MUST** implement; document **MUST** include `authorization_servers` with at least one entry. Discovery via `WWW-Authenticate` `resource_metadata` on 401 **or** well-known URI (path-scoped `/.well-known/oauth-protected-resource/<mcp-path>` first, then root). Clients **MUST** support both and fall back to well-known probing when the header is absent. |
| **RFC 8414** AS Metadata / OIDC Discovery | Client learns AS endpoints | AS **MUST** provide at least one of RFC 8414 or OpenID Connect Discovery 1.0; clients **MUST** support both, trying path-insertion variants first for issuers with path components. (In 2025-06-18, RFC 8414 alone was the MUST.) |
| **PKCE** (OAuth 2.1 §7.5.2) | Code protection | Clients **MUST** implement PKCE, **MUST** use `S256`, and **MUST refuse to proceed** if `code_challenge_methods_supported` is absent from AS metadata — so the server's AS must advertise it. |
| **RFC 8707** Resource Indicators | Token audience binding | Clients **MUST** send `resource` in both authorization and token requests "regardless of whether authorization servers support it". MCP servers **MUST** validate that tokens were issued for them (audience) and reject all others; token passthrough is forbidden. |
| **RFC 7591** Dynamic Client Registration | Client obtains client_id | Downgraded to **MAY** in 2025-11-25 ("included for backwards compatibility"); **Client ID Metadata Documents (CIMD)** are now the **SHOULD**. In 2025-06-18 DCR was the SHOULD. Claude supports both (section 2). |

### Other spec obligations on the server

- `Authorization: Bearer <token>` arrives on **every** HTTP request; tokens **MUST NOT** be accepted from the query string. Invalid/expired token → **401**; insufficient scope → **403** with `WWW-Authenticate: Bearer error="insufficient_scope", scope="…"`. ([spec][spec-auth])
- Scopes: the server **SHOULD** put a `scope` parameter in the 401 `WWW-Authenticate` challenge. Client scope-selection priority: (1) `scope` from the challenge, (2) all of `scopes_supported` from Protected Resource Metadata, (3) omit `scope`. ([spec][spec-auth])
- The AS **SHOULD** issue short-lived access tokens and **MUST rotate refresh tokens for public clients** (OAuth 2.1 §4.3.1). ([spec][spec-auth])
- Redirect URIs **MUST** be pre-registered and validated by **exact match**; `localhost` or HTTPS only. ([spec][spec-auth])

## 2. What Claude actually does — Anthropic official docs

Primary sources: [Authentication for connectors][auth-doc] (claude.com/docs), [Third party connectors with remote MCP][remote-mcp-doc] (claude.com/docs), [Get started with custom connectors using remote MCP][hc-connectors] (support.claude.com).

### Supported auth types

From the [auth doc][auth-doc]: `oauth_dcr` (RFC 7591, "supported out of the box"), `oauth_cimd`, `oauth_anthropic_creds` (Anthropic stores your client_id/secret; via `mcp-review@anthropic.com`), `custom_connection`, `static_headers` (beta request-header credential), `none`. Pure machine-to-machine `client_credentials` is **not supported** — "Every connection requires user consent."

### Registration: DCR vs. CIMD vs. manual fields

- **Default is DCR.** Claude registers a **new client on every fresh connection**, which can bloat your AS's client table — Anthropic recommends CIMD or Anthropic-held credentials for high-traffic servers. ([auth doc][auth-doc])
- **CIMD is selected only when** AS metadata advertises **both** `"client_id_metadata_document_supported": true` **and** `"none"` in `token_endpoint_auth_methods_supported`; otherwise Claude falls back to DCR. ([auth doc][auth-doc])
- **Manual OAuth Client ID/Secret fields** (Add custom connector → Advanced settings, or Organization settings → Connectors for Team/Enterprise owners): optional pre-registered static credentials. "The OAuth Client Secret field is optional. Supply it only if your authorization server requires confidential-client authentication." Supplying your own client ID skips DCR entirely and scopes the OAuth client to the organization that entered it. ([auth doc][auth-doc], [remote-mcp doc][remote-mcp-doc], [help center][hc-connectors])

### Redirect URIs

- Hosted surfaces (claude.ai web, **Claude Desktop**, mobile, Cowork — "the same infrastructure backs" all of them): register **`https://claude.ai/api/mcp/auth_callback`**. ([auth doc][auth-doc])
- First-party issue reports show Claude also using **`https://claude.com/api/mcp/auth_callback`** (post-rebrand domain) in real flows — register both forms. ([issue #632][i632])
- **Claude Code** (out of scope for connectors but shares your AS): RFC 8252 loopback on an ephemeral port; declares `http://localhost/callback` and `http://127.0.0.1/callback` in its [CIMD](https://claude.ai/oauth/claude-code-client-metadata); your AS must match both **ignoring the port**. ([auth doc][auth-doc])

### The 401 handshake

- Claude honors `WWW-Authenticate` **only on an actual 401** — never on a 200. The `resource_metadata` URL may live off-origin (useful for platforms that can't serve root `/.well-known/*`). Fallback without the header: Claude probes `/.well-known/oauth-protected-resource/<mcp-path>`, then the root document. ([auth doc][auth-doc])
- Protected Resource Metadata `resource` must equal the connector URL **exactly as the user entered it**, including path. If `authorization_servers` lists several issuers, **Claude uses the first entry only**. ([auth doc][auth-doc])

### Scopes — request and display

- "To control which scopes Claude requests, include a `scope` parameter in the `WWW-Authenticate` header on your 401 response. If you don't, Claude requests the scopes your protected resource metadata advertises in `scopes_supported`. Claude also appends `offline_access` when your authorization server metadata lists it in `scopes_supported`, to obtain a refresh token." ([auth doc][auth-doc])
- Scope **display/consent happens on your authorization server's consent screen**, not in Claude's UI; Anthropic tells users to "carefully review requested permission scopes during authentication." ([remote-mcp doc][remote-mcp-doc])

### Access/refresh token behavior

- "Claude refreshes tokens **reactively on a 401 response**, with a proactive refresh up to **five minutes before the stored expiry**." Return RFC 6749 `invalid_grant` (not custom codes) for dead refresh tokens; rotate refresh tokens for public clients and return the new one in the same response that invalidates the old one. ([auth doc][auth-doc])
- Token endpoint must accept `application/x-www-form-urlencoded` (both exchange and refresh); `/register` uses `application/json`. Latency budget: **10 s** for discovery/registration/token, **30 s** for refresh — slower responses are treated as failures. ([auth doc][auth-doc])

### Network and transport

- Requests originate from Anthropic's cloud (`160.79.104.0/21`), so the server must be publicly reachable; **AS discovery requests come from the same range**, so a WAF in front of the identity provider can break the flow. ([auth doc][auth-doc], [help center][hc-connectors])
- Transport is Streamable HTTP; SSE is on the deprecation track per the claude-ai-mcp announcements charter. ([claude-ai-mcp README][repo-readme])

## 3. Known client bugs that constrain the server (anthropics/claude-ai-mcp)

| Issue | Bug | Status (2026-08-18) | Server-side constraint |
|-------|-----|---------------------|------------------------|
| [#155][i155] (dupes #100, #136, #336, #690, #872) | claude.ai completes OAuth (token endpoint returns 200) but **never attaches the Bearer token** to subsequent MCP requests — 401/refresh loop or total "silent abandon"; UI shows "Authorization with the MCP server failed" | Closed *completed* 2026-05-10 after a cross-origin-redirect fix; silent-abandon variant re-reported through 2026-06 ([#430][i430], closed not-planned) | Enter/serve one **canonical URL with zero redirects** (no trailing-slash 307s — e.g. FastAPI `redirect_slashes=False`); advertise only public HTTPS endpoints in AS metadata (never localhost); keep all tool `inputSchema`s valid `type: object` |
| [#82][i82] / [#214][i214] / [#827][i827] | With an **external AS whose issuer URL has a path component**, Claude's discovery tried only path-aware well-known variants, then **synthesized `/authorize`, `/token`, `/register` on the MCP origin**, ignoring your published endpoints. Root cause confirmed by Anthropic collaborator; fallback fix shipped, but [#827][i827] (2026-08-10) shows the failure mode recurring against Splunk Cloud | #82/#214 closed completed; #827 open | Prefer an issuer URL **without a path component**; ensure the RFC 8414 path-insertion well-known variants all resolve; where possible serve AS metadata from the MCP origin root as a safety net |
| [#219][i219] | **Case-sensitive `WWW-Authenticate` match**: over HTTP/2 (lowercase header names on the wire) Claude ignored the `resource_metadata` hint and looped unauthenticated | Closed not-planned | Don't depend on the header alone — also serve the RFC 9728 well-known documents at the probed paths so fallback discovery succeeds |
| [#5][i5] | After the 2025-12-18 Desktop update, DCR requested `token_endpoint_auth_method: client_secret_post`; AS supporting only `client_secret_basic`/`none` **rejected registration** (Anthropic staff jerome3o-anthropic / crondinini-ant confirmed the lead) | Closed | Your DCR endpoint must accept `client_secret_post` and/or `none` |
| [#840][i840], [#253][i253] | Claude **never requested `offline_access`** even when advertised → no refresh token; connection **silently dies at access-token expiry while still showing "connected"** (Entra ~1 h, managed connector ~24 h) | #840 open, #253 closed | List `offline_access` in AS `scopes_supported` *and* in the 401 `scope` challenge; expect that refresh may still not happen — favor longer-lived access tokens if your threat model allows |
| [#228][i228], [#319][i319] | Refresh **never attempted** on the `mcp-proxy.anthropic.com` path; iOS forces interactive re-auth at every expiry | Open | Same as above: tolerate expired-token reconnects gracefully (clean 401 → re-auth must always work) |
| [#833][i833], [#865][i865] | Authorization code issued and delivered to `claude.ai/api/mcp/auth_callback`, but Claude **never calls `/token`** | Open | Nothing server-side fixes this; keep `/authorize` → callback redirect a plain 302 with `code` + `state` and no interstitials, and capture logs for support (`ofid_…` references) |
| [#99][i99] | Stateful servers relying on `Mcp-Session-Id` were broken by client session handling | Closed | Prefer a **stateless** Streamable HTTP server; never bind auth state to MCP session IDs |

Recurring theme across staff responses: Anthropic debugs these **per server URL** (see crondinini-ant's note in [#5][i5]), so keep server-side request logs and collected `ofid_` references ready when filing.

## 4. Practical checklist for an rv-checklist MCP server

1. One canonical MCP URL, no redirects of any kind on that path.
2. 401 + `WWW-Authenticate: Bearer resource_metadata="…", scope="…"` on every unauthenticated request; also serve `/.well-known/oauth-protected-resource[/<path>]`.
3. AS metadata (RFC 8414 and/or OIDC Discovery) with `code_challenge_methods_supported: ["S256"]`, issuer **without** a path component, all endpoints public HTTPS.
4. DCR endpoint accepting `client_secret_post`/`none`, JSON body, 201 with `client_id` — or advertise CIMD (`client_id_metadata_document_supported: true` + `"none"` auth method).
5. Allow redirect URIs `https://claude.ai/api/mcp/auth_callback` and `https://claude.com/api/mcp/auth_callback` (exact match), plus port-agnostic `http://localhost/callback` and `http://127.0.0.1/callback` for Claude Code.
6. Token endpoint: form-urlencoded, `resource` parameter tolerated, refresh tokens with rotation, `invalid_grant` on dead refresh, responses well under 10 s.
7. Validate bearer audience against the canonical MCP URL; 401 for bad tokens, 403 `insufficient_scope` for scope gaps.
8. Stateless Streamable HTTP; reachable from `160.79.104.0/21` (MCP host and AS host).

## Sources

- MCP Authorization spec, 2025-11-25 (current): <https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization>
- MCP Authorization spec, 2025-06-18: <https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization>
- Anthropic — Authentication for connectors: <https://claude.com/docs/connectors/building/authentication>
- Anthropic — Third party connectors with remote MCP: <https://claude.com/docs/connectors/custom/remote-mcp>
- Anthropic Help Center — Get started with custom connectors using remote MCP: <https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp>
- anthropics/claude-ai-mcp README (repo charter, SSE deprecation announcements): <https://github.com/anthropics/claude-ai-mcp>
- Issues: [#5][i5], [#82][i82], [#99][i99], [#155][i155], [#214][i214], [#219][i219], [#228][i228], [#253][i253], [#319][i319], [#430][i430], [#632][i632], [#827][i827], [#833][i833], [#840][i840], [#865][i865]

[spec-auth]: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
[spec-auth-0618]: https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization
[auth-doc]: https://claude.com/docs/connectors/building/authentication
[remote-mcp-doc]: https://claude.com/docs/connectors/custom/remote-mcp
[hc-connectors]: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
[repo-readme]: https://github.com/anthropics/claude-ai-mcp
[i5]: https://github.com/anthropics/claude-ai-mcp/issues/5
[i82]: https://github.com/anthropics/claude-ai-mcp/issues/82
[i99]: https://github.com/anthropics/claude-ai-mcp/issues/99
[i155]: https://github.com/anthropics/claude-ai-mcp/issues/155
[i214]: https://github.com/anthropics/claude-ai-mcp/issues/214
[i219]: https://github.com/anthropics/claude-ai-mcp/issues/219
[i228]: https://github.com/anthropics/claude-ai-mcp/issues/228
[i253]: https://github.com/anthropics/claude-ai-mcp/issues/253
[i319]: https://github.com/anthropics/claude-ai-mcp/issues/319
[i430]: https://github.com/anthropics/claude-ai-mcp/issues/430
[i632]: https://github.com/anthropics/claude-ai-mcp/issues/632
[i827]: https://github.com/anthropics/claude-ai-mcp/issues/827
[i833]: https://github.com/anthropics/claude-ai-mcp/issues/833
[i840]: https://github.com/anthropics/claude-ai-mcp/issues/840
[i865]: https://github.com/anthropics/claude-ai-mcp/issues/865

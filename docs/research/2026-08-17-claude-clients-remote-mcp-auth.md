# How Claude Clients Connect to Remote MCP Servers, and What Auth They Accept

**Scope:** How each Claude surface the owner uses — Claude Desktop, claude.ai, Claude Code — connects to a **remote** (HTTP) MCP server, and whether each accepts a static bearer token or requires OAuth. Resolves wayfinder ticket [#66](https://github.com/jtoniolo/rv-checklist/issues/66) (map: #64).

**Date compiled:** 2026-08-17. All sources are Anthropic first-party docs, the MCP specification, or the `mcp-remote` package README, checked on this date. These products change fast; re-verify before implementation.

---

## Summary table

| Client | Remote HTTP MCP support | Static bearer token | OAuth | Caveat |
|---|---|---|---|---|
| Claude Code | Yes — `.mcp.json` `"type": "http"` or `claude mcp add --transport http` | **Yes**, native — `headers` field / `--header` flag, with `${VAR}` env expansion | Optional (`/mcp` to authenticate) | None |
| Claude Desktop | Yes — custom connectors (remote MCP URL) | **Yes (beta)** — "Request headers" in the Add custom connector dialog; **Yes (stable)** via `mcp-remote` stdio proxy in `claude_desktop_config.json` | Optional | Request-headers UI is in beta, slow rollout |
| claude.ai (web) | Yes — custom connectors (same dialog as Desktop) | **Yes (beta)** — Request headers only; no local config file, so no `mcp-remote` fallback | Optional | If the account lacks the beta, choices are OAuth or an authless server |

**Bottom line: no Claude client forces OAuth 2.1.** The MCP spec makes authorization OPTIONAL, and every surface has a static-bearer-token path. The only weak link is claude.ai/Desktop's "Request headers" feature being in beta; Claude Desktop has a stable `mcp-remote` fallback, claude.ai does not.

---

## 1. Claude Desktop / claude.ai custom connectors

Source: [Third party connectors with remote MCP](https://claude.com/docs/connectors/custom/remote-mcp) (Claude docs) and [Get started with custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp) (help center). Checked 2026-08-17.

- **Remote URL support:** "You can manually add any third-party connector to Claude as long as you have the URL of that remote MCP server." Added under **Customize > Connectors > Add custom connector** (individual plans) or **Organization settings > Connectors** (Team/Enterprise, Owners only; members then connect individually).
- **Plan gating:** Available on Free, Pro, Max, Team, and Enterprise; Free is limited to one connector. On Team/Enterprise only Owners can add connectors. (Help center article 11175166.)
- **Surfaces:** claude.ai web, Claude Desktop, and Cowork share the connector configuration.
- **Auth options in the dialog:**
  - **No auth:** authless remote servers are supported (help center: Claude "supports both authless and OAuth-based remote servers").
  - **OAuth:** default flow; "Advanced settings" optionally takes a pre-registered OAuth Client ID and Client Secret.
  - **Request headers (static credential) — beta:** "If your MCP server authenticates with an API key, bearer token, or other fixed credential instead of OAuth, you can configure it in the **Request headers** section of the Add custom connector dialog." Values are stored securely, hidden after save, and sent on every request.
    - The docs flag it: "Request header authentication is in beta. This feature is being slowly rolled out to customers; contact Anthropic for early access."
    - Header names come from an allowlist (`authorization`, `x-api-key`, `x-auth-token`, and similar); up to four headers.
    - The value is sent verbatim — for a bearer token you must enter `Bearer <token>` including the scheme and space.
    - On an OAuth connection, extra headers may be added but `Authorization` cannot ("OAuth owns that header").
    - The docs position request headers for exactly our case: "services where everyone in your organization shares one credential, such as an internal tool or a service account."
- **Transports:** Streamable HTTP and SSE, with SSE deprecation expected (help center article 11175166 via search snippet; Streamable HTTP is the safe target).
- **Claude Desktop local config:** Desktop additionally reads `claude_desktop_config.json` for **local stdio** servers — this is what makes the `mcp-remote` fallback possible (see section 2; the `mcp-remote` README's client examples target this file).

## 2. `mcp-remote` fallback (stdio-to-HTTP proxy)

Source: [`mcp-remote` README](https://github.com/geelen/mcp-remote) (npm package by the same name). Checked 2026-08-17.

- Purpose: "Connect an MCP Client that only supports local (stdio) servers to a Remote MCP Server, with auth support." By default it drives the MCP OAuth flow, but:
- **Header injection: yes.** `--header "Authorization: Bearer ${AUTH_TOKEN}"` injects a static credential. Known bug: "Cursor and Claude Desktop (Windows) have a bug where spaces inside `args` aren't escaped when it invokes `npx`" — workaround is `--header "Authorization:${AUTH_HEADER}"` (no spaces) with the env var set to `Bearer <token>`.
- Also supports `--allow-http` (trusted private networks only) and `--transport http-only|http-first|sse-first|sse-only`.
- **Status:** still the standard workaround for clients without native remote/header support, and the only static-token path on Claude Desktop for accounts without the request-headers beta. Not applicable to claude.ai web (no local process).

## 3. Claude Code `.mcp.json`

Source: [Connect Claude Code to tools via MCP](https://code.claude.com/docs/en/mcp) (Claude Code docs). Checked 2026-08-17.

- **HTTP transport:** `claude mcp add --transport http <name> <url>`, stored as `{"type": "http", "url": "..."}` in `.mcp.json` (project scope), `~/.claude.json` (local/user scope). `"type": "streamable-http"` is accepted as an alias.
- **Headers:** native. CLI: `claude mcp add --transport http secure-api https://api.example.com/mcp --header "Authorization: Bearer your-token"` (`-H` short form). JSON: a `headers` object on the server entry.
- **Env var expansion:** `${VAR}` and `${VAR:-default}` expand in `command`, `args`, `env`, `url`, and `headers`. Documented example is precisely our shape:

  ```json
  {
    "mcpServers": {
      "api-server": {
        "type": "http",
        "url": "${API_BASE_URL:-https://api.example.com}/mcp",
        "headers": { "Authorization": "Bearer ${API_KEY}" }
      }
    }
  }
  ```

  This lets `.mcp.json` be committed with the token kept in the environment.
- **OAuth:** optional — `/mcp` authenticates with servers that require OAuth 2.0. Nothing forces it. The docs' own GitHub example uses a static PAT header, confirming static-token remote servers are a first-class path.

## 4. What the MCP spec requires of the server

Source: [MCP Authorization specification, 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization). Checked 2026-08-17.

- "Authorization is **OPTIONAL** for MCP implementations." Only *if* an HTTP implementation does authorization per the spec does the OAuth 2.1 machinery (Protected Resource Metadata, dynamic client registration, PKCE, resource indicators) apply.
- A server that authenticates with a fixed bearer token outside the OAuth flow is simply not implementing spec authorization; clients treat it like an authless server that happens to require a header. Spec-side hygiene still worth honoring: send the token in the `Authorization` header on every request, never in the URI query string, and return 401 for a bad/missing token.
- Consequence: our NestJS MCP endpoint can validate `Authorization: Bearer <mcp-token>` (the existing JWT-guard seam) and needs **no** OAuth 2.1 authorization server, discovery metadata, or DCR — unless we later want claude.ai support without the request-headers beta.

## Bottom line

**A single static bearer token works across all three clients; none forces OAuth 2.1 on the server.**

- **Claude Code:** fully native and stable — `type: http` + `headers` with `${VAR}` expansion. Zero risk.
- **Claude Desktop:** native "Request headers" (beta, allowlisted names, value entered as `Bearer <token>`); if the beta isn't on the account, `mcp-remote` in `claude_desktop_config.json` with `--header` is a stable fallback.
- **claude.ai web:** the request-headers beta is the only static-token path — no local config, no `mcp-remote`. If the owner's account doesn't have the beta, claude.ai requires either an OAuth 2.1 flow or an authless (or secret-URL) server.

Design implication for rv-checklist: build the MCP endpoint as Streamable HTTP validating `Authorization: Bearer <profile MCP token>`. Verify the request-headers beta is enabled on the owner's claude.ai account before counting on the claude.ai surface; otherwise plan Desktop + Code first and treat claude.ai as blocked on the beta rollout (or on adding an OAuth layer later).

## Sources

1. Third party connectors with remote MCP — Claude docs: <https://claude.com/docs/connectors/custom/remote-mcp> (checked 2026-08-17)
2. Get started with custom connectors using remote MCP — Claude Help Center article 11175166: <https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp> (checked 2026-08-17)
3. Building custom connectors via remote MCP servers — Claude Help Center article 11503834: <https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers> (authless + OAuth support, transports; article intermittently 404'd on 2026-08-17, content corroborated via search index and article 11175166)
4. Connect Claude Code to tools via MCP — Claude Code docs: <https://code.claude.com/docs/en/mcp> (checked 2026-08-17)
5. `mcp-remote` README — <https://github.com/geelen/mcp-remote> (npm: `mcp-remote`; checked 2026-08-17)
6. MCP Authorization specification (2025-06-18) — <https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization> (checked 2026-08-17)

# Building an MCP Server Inside a NestJS API

**Scope:** How to serve MCP (Model Context Protocol) from the existing NestJS 11 / Express REST API (`apps/api`). Answers the five questions in [issue #65](https://github.com/jtoniolo/rv-checklist/issues/65). Covers the official TypeScript SDK, the Streamable HTTP transport, stateless vs stateful operation, the `@rekog/mcp-nest` Nest integration, Zod schema reuse, and bearer-token auth.

**Date compiled:** 2026-08-17

**Source-priority note:** All claims come from primary sources: the MCP specification on modelcontextprotocol.io (revisions 2025-06-18 and 2026-07-28), the `modelcontextprotocol/typescript-sdk` GitHub repository and its published npm packages, the npm registry (versions, dependency ranges, download counts), and the `rekog-labs/MCP-Nest` repository and npm package. No secondary write-ups were used.

---

## Summary

| Question | Answer |
|---|---|
| Official SDK | Two lines. v1 monolith `@modelcontextprotocol/sdk` at **1.30.0**. v2 is current stable, split into `@modelcontextprotocol/core` / `server` / `node` / `express`, all at **2.0.0**, aligned with spec revision 2026-07-28. |
| Single endpoint | Yes. The spec requires one MCP endpoint path (for example `POST /api/mcp`). Older protocol revisions also use GET (SSE stream) and DELETE (session end) on the same path. |
| Stateless vs stateful | Spec 2026-07-28 **removed sessions from the protocol**. Stateless is now the default and the direction of travel. Stateless costs: no server-initiated push outside a request, no session state, no SSE resumability (also removed from the spec). |
| Nest integration | `@rekog/mcp-nest` v2.0.1 is mature: ~160k weekly downloads, active (released 2026-08-17), built on SDK v2, serves both protocol eras on one `/mcp` endpoint, Nest guards apply to tools. Prefer it over hand-mounting. |
| Zod | The SDK accepts Zod directly. v1 supports `zod ^3.25 || ^4.0`; v2 uses Standard Schema (Zod v4 works as-is). `@rekog/mcp-nest` requires `zod ^4`. The repo's `zod ^4.4.3` needs **no conversion**. |
| Auth | MCP authorization is **OPTIONAL**. Guarding the route with the existing Nest bearer-token guard is permitted. The full OAuth 2.1 flow (RFC 9728 metadata, audience validation) is only required if we adopt the spec's discovery-based authorization. |

---

## 1. The official TypeScript SDK and how to mount it

### Versions

- The monolithic package `@modelcontextprotocol/sdk` has npm dist-tag `latest: 1.30.0`. Its dependencies include `zod: ^3.25 || ^4.0` and `express: ^5.2.1` ([npm registry](https://www.npmjs.com/package/@modelcontextprotocol/sdk)). ~35M weekly downloads ([npm downloads API](https://api.npmjs.org/downloads/point/last-week/@modelcontextprotocol/sdk)).
- **v2 is the current stable release**, aligned with MCP spec revision 2026-07-28. The `main` branch of the repo is v2; v1.x receives "bug fixes and security updates for at least 6 months after v2's release" ([typescript-sdk README](https://github.com/modelcontextprotocol/typescript-sdk)). v2 is split into packages, all at `latest: 2.0.0` on npm: `@modelcontextprotocol/core`, `@modelcontextprotocol/server`, `@modelcontextprotocol/node`, `@modelcontextprotocol/express`.

### Single endpoint: yes

The Streamable HTTP transport spec (2025-06-18) states: "The server **MUST** provide a single HTTP endpoint path ... that supports both POST and GET methods. For example, this could be a URL like `https://example.com/mcp`" ([transports spec 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)). On that one path:

- **POST** carries every client-to-server JSON-RPC message; the server replies with `application/json` or opens an SSE (`text/event-stream`) response.
- **GET** opens an optional server-to-client SSE stream (server may return 405).
- **DELETE** terminates a session (server may return 405).

In spec revision 2026-07-28 the GET stream and DELETE are gone: server-to-client notifications moved to a long-lived POST response stream (`subscriptions/listen`), still on the same single endpoint ([2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog), items 1 and 4). So `POST /api/mcp` as the single MCP endpoint is the standard pattern in every revision.

### Mounting on Express/Nest

v2 pattern, from the [`@modelcontextprotocol/express` README](https://www.npmjs.com/package/@modelcontextprotocol/express):

```ts
const server = new McpServer({ name: 'my-server', version: '1.0.0' });
app.post('/mcp', async (req, res) => {
  // Stateless: create a transport per request.
  const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
```

v1 pattern is the same shape ([v1.29.0 README](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.29.0/README.md)): `StreamableHTTPServerTransport` with `sessionIdGenerator: randomUUID` plus a `Map<sessionId, transport>` keyed on the `mcp-session-id` header for stateful mode, or `sessionIdGenerator: undefined` with a fresh server+transport per request for stateless mode. In Nest this maps to one controller (or middleware) that passes the raw `req`/`res` through to `transport.handleRequest`. The helper package also ships `hostHeaderValidation` for DNS-rebinding protection, which the spec requires for `Origin`/Host validation ([transports spec, Security Warning](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)).

## 2. Stateless vs stateful

Stateful (2025-era protocol): the server mints an `Mcp-Session-Id` at initialization; the client echoes it on every request; DELETE ends the session ([transports spec 2025-06-18, Session Management](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)). This enables per-session state, a standing GET/SSE stream for server-initiated messages, and resumability via SSE event IDs + `Last-Event-ID`. Cost: the transport object holds state in process memory, so multi-instance deployments need sticky sessions or shared state, plus session lifecycle cleanup.

Stateless: `sessionIdGenerator: undefined`, new transport per request, no session header. Horizontally scalable, no cleanup.

What stateless costs us:

- No server-initiated notifications or requests outside an active request stream.
- No per-session server state.
- No SSE resumability/redelivery.

Decisive fact: spec revision 2026-07-28 (the current one) **removed protocol-level sessions and the `Mcp-Session-Id` header entirely**, removed the `initialize` handshake (each request now carries protocol version and capabilities in `_meta`), and removed SSE resumability. "Servers that need cross-call state use explicit, server-minted handles passed as ordinary tool arguments" ([2026-07-28 changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog), items 1, 2, 9). For this project's use case (tools that read/write checklist and maintenance data through the existing API), stateless loses nothing we need. Note: many deployed clients still speak the 2025-era protocol, so serving both eras is the safe compatibility position (see next section).

## 3. Nest-native integration: `@rekog/mcp-nest`

Facts from the [npm registry](https://www.npmjs.com/package/@rekog/mcp-nest), [npm downloads API](https://api.npmjs.org/downloads/point/last-week/@rekog/mcp-nest), and the [MCP-Nest repo](https://github.com/rekog-labs/MCP-Nest):

- Latest **2.0.1**, published 2026-08-17. ~160,546 weekly downloads. 695 stars, 24 open issues, repo pushed the same day. Not archived.
- Peer deps: `@nestjs/common`/`@nestjs/core >=9.0.0` (Nest 11 OK), `express >=4.0.0`, `zod ^4.3.5`, and the SDK v2 packages `@modelcontextprotocol/core`/`node`/`server` `^2.0.0-beta.5` (satisfied by stable 2.0.0).
- v2 API: an `McpStrategy` registered as a Nest `CustomTransportStrategy`. Tools/resources/prompts are methods on `@McpController()` classes decorated with `@Tool()`/`@Resource()`/`@Prompt()`, and are real `@MessagePattern` handlers — **NestJS guards, pipes, interceptors, and exception filters apply to them** ([MCP-Nest README](https://github.com/rekog-labs/MCP-Nest)).
- Serves **both** the 2025-era protocol (initialize + sessions) and the 2026-07-28 stateless revision concurrently from the same `/mcp` endpoint, with no code changes ([MCP-Nest README](https://github.com/rekog-labs/MCP-Nest)). Hand-mounting the SDK gives us only one era per mounted transport; dual-era support by hand means extra work.
- Caution: v2 is a fresh rewrite (v1 used `McpModule.forRoot()`; a migration guide documents the break). Pin the version. The optional `@rekog/mcp-nest-auth` authorization server is marked Beta — we do not need it.

Verdict: mature enough to prefer. It removes the by-hand transport/session plumbing, gives dual-era protocol support for free, and lets the existing auth guard protect tools natively.

## 4. Deriving tool input schemas from existing Zod schemas

Supported directly; no conversion layer needed.

- SDK v1 (1.30.0) declares `zod: "^3.25 || ^4.0"` as a dependency ([npm registry](https://www.npmjs.com/package/@modelcontextprotocol/sdk)); `registerTool` takes Zod schemas as the `inputSchema` ([v1.29.0 README](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.29.0/README.md)).
- SDK v2: "Tool and prompt schemas use Standard Schema — bring Zod v4, Valibot, ArkType, or any compatible library"; examples import from `zod/v4` and pass `inputSchema: z.object({...})` to `registerTool` ([typescript-sdk README](https://github.com/modelcontextprotocol/typescript-sdk)).
- `@rekog/mcp-nest` uses Zod for `@Tool()` parameter validation, peer `zod ^4.3.5` ([npm registry](https://www.npmjs.com/package/@rekog/mcp-nest)).

The repo's `zod ^4.4.3` satisfies all three. Schemas in `libs/shared/domain` can be passed as-is, or narrowed with `.pick()`/`.omit()` per tool. If raw JSON Schema is ever needed, Zod v4's built-in `z.toJSONSchema()` covers it — but none of the paths above require it.

## 5. Bearer-token auth

What the spec says ([authorization spec 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)):

- "Authorization is **OPTIONAL** for MCP implementations. When supported: Implementations using an HTTP-based transport **SHOULD** conform to this specification."
- The spec's flow makes the MCP server an OAuth 2.1 resource server: it MUST implement OAuth 2.0 Protected Resource Metadata (RFC 9728), MUST validate tokens and their audience, and MUST return 401 with a `WWW-Authenticate` header pointing at the resource metadata. Tokens travel as `Authorization: Bearer <token>` on every request; never in the query string.
- The transports spec separately says servers "**SHOULD** implement proper authentication for all connections" ([transports spec](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)).

Options for this API:

1. **Guard the route (recommended now).** Because authorization is optional, applying the existing Nest bearer-token guard to the MCP endpoint/tools is spec-permitted. With `@rekog/mcp-nest`, the guard goes on the `@McpController()` like any other controller. Clients configure the token manually (standard `Authorization: Bearer` header). What we give up: automatic auth discovery — a generic MCP client cannot discover *how* to get a token; the user must paste one.
2. **SDK auth hooks (later, if needed).** `@modelcontextprotocol/express` ships `requireBearerAuth(options)` (validates `Authorization: Bearer ...` via an `OAuthTokenVerifier` you implement — it can wrap our existing token verification) and `mcpAuthMetadataRouter` to serve RFC 9728 metadata ([@modelcontextprotocol/express README](https://www.npmjs.com/package/@modelcontextprotocol/express)). This is the upgrade path to discovery-based OAuth if we ever want "connect by URL" from arbitrary clients.

---

## Recommendation for rv-checklist

1. **Adopt `@rekog/mcp-nest` v2 (pinned)** inside `apps/api` instead of hand-mounting the SDK. Rationale: SDK v2-based, dual-era protocol support (sessions for older clients, 2026-07-28 stateless for current ones) on one endpoint, tools as Nest handlers with DI, and native guard support. Hand-mounting `@modelcontextprotocol/server` + `node` in a controller is the fallback if mcp-nest v2 proves too fresh; the per-request stateless pattern is ~10 lines.
2. **Single endpoint at `/api/mcp`**, stateless operation. Do not build session state; the current spec has none. Keep cross-call references as explicit IDs in tool arguments (rig ID, checklist ID), which matches our REST design.
3. **Reuse the Zod v4 schemas from `libs/shared/domain` directly** as tool input schemas. No conversion.
4. **Auth: existing bearer-token guard on the MCP controller.** Skip the OAuth 2.1 / RFC 9728 machinery until there is a concrete need for auto-discovery by third-party clients; `requireBearerAuth` + `mcpAuthMetadataRouter` are the documented upgrade path.

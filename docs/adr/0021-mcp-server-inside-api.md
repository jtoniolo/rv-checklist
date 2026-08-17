# 21. MCP server inside the API

Date: 2026-08-17

## Status

Accepted

## Context

MCP support (wayfinder map #64) lets Claude clients do everything the owner
can do in the UI, authenticated by a single static MCP token on the user
profile. The open question (ticket #67) was where the MCP server lives and
how it is wired. Research (#65, #66) established: the MCP spec mandates one
endpoint path; spec revision 2026-07-28 removed sessions, making stateless
the protocol default; `@rekog/mcp-nest` v2 is a mature NestJS integration
built on the official SDK v2, serving both protocol eras on one endpoint and
accepting our Zod v4 schemas directly; and Claude Code may ignore a
configured static token if the server advertises OAuth.

## Decision

- **The MCP server lives inside the existing NestJS API** as a single
  endpoint, `POST /api/mcp` — no separate app or process.
- **`@rekog/mcp-nest` (version pinned) provides the integration.** Tools are
  ordinary Nest handlers, so the existing guards, pipes, and DI apply.
- **The transport is stateless.** No sessions, no per-client state, no
  server-initiated push — consistent with the pull-based product stance
  (ADR-0005) and the 2026-07-28 spec default.
- **Tool handlers call the existing services directly**, passing the token
  owner's `ownerId` as the first argument — the same seam the REST
  controllers use. No HTTP-to-self.
- **No deployment changes.** Same container, port, Helm chart, and
  Cloudflare Tunnel hostname; the endpoint sits under the existing `/api`
  prefix. CORS is unchanged — MCP clients call server-to-server, so the
  `WEB_ORIGIN`-only browser policy stands.
- **The endpoint never advertises OAuth.** Failed auth returns a plain 401
  with no OAuth discovery metadata, and no OAuth discovery routes are
  served. This keeps static-token clients (notably Claude Code) from being
  diverted into an OAuth flow the server does not offer.

## Alternatives considered

- **Separate MCP app/process** — rejected: blast-radius isolation is not
  worth a second deploy unit for a single-owner app, and it would force
  tool handlers through HTTP instead of the `ownerId` service seam.
- **Hand-mounting the official SDK transport** — rejected: `@rekog/mcp-nest`
  sits on the same SDK, so it adds no lock-in beyond a pinned dependency,
  and hand-mounting would re-implement guard/DI wiring the library gives us.
- **OAuth 2.1 authorization** — rejected for now: it requires running a full
  authorization server (authorize/token/registration endpoints, PKCE,
  consent UI) for roughly 5–10× the work, and the static token already
  covers Claude Code and Desktop, with claude.ai via its request-headers
  beta. Revisit only if the static-token decision is redrawn.

## Consequences

- The MCP tool layer is a thin adapter over existing services; owner-scoping
  rules apply unchanged.
- Cross-call references (e.g. a rig picked in one call, used in another)
  travel as plain IDs in tool arguments — nothing is remembered server-side.
- Older Claude clients on the sessionful protocol era still connect, because
  `@rekog/mcp-nest` serves both eras on the one endpoint.
- Adding OAuth later is a new decision with real scope (an authorization
  server), not a flag flip.

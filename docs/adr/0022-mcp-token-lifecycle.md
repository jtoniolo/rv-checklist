# 22. MCP token lifecycle

Date: 2026-08-17

## Status

Accepted — amended by [ADR-0024](0024-mcp-oauth-authorization.md):
OAuth grants coexist behind a composite guard, and the avatar menu
gains a Connected apps page beside the MCP Token dialog. The `rvmcp_`
lifecycle rules here stand unchanged.

## Context

The MCP endpoint (ADR-0021) authenticates with a single MCP-specific token
per user — that much was fixed by the owner on wayfinder map #64. Ticket #68
decided the lifecycle: format, storage, cardinality, expiry, and where the
token is managed. Client research (#66) confirmed a static bearer token
works with every Claude surface, so no OAuth arrangement is needed. The
refresh-token entity (ADR-0002) is the storage template.

## Decision

- **Format**: an opaque random secret — 32 random bytes, base64url, with the
  prefix `rvmcp_`. Sent as `Authorization: Bearer`. The prefix identifies
  the token in logs and secret scanners, and lets the auth guard route MCP
  tokens away from the JWT path before any parsing.
- **Storage**: only the SHA-256 hash at rest, same as refresh tokens. The
  raw value is shown once, at creation, and is not retrievable. The row
  tracks `last_used_at` so the UI can show recent agent activity.
- **Cardinality**: one active token per user. Regenerate creates the new
  token and revokes the old one in the same atomic step.
- **Expiry**: none. The token lives until the user revokes or regenerates
  it. Every call checks the hash in the database, so revocation is
  immediate.
- **Actions**: *regenerate* (rotate) and *revoke* (kill the token, leaving
  MCP access off until a new one is generated).
- **UI**: a small dialog opened from a new avatar-menu entry — no profile
  page. The dialog holds the show-once token display with a copy button,
  the "last used" line, and the regenerate and revoke buttons.

## Alternatives considered

- **JWT format** — rejected: stateless validation would need a denylist for
  revocation, which reintroduces the database check it was meant to avoid.
- **Retrievable token** (stored raw) — rejected: a database leak would
  expose live credentials, and regeneration is cheap enough that
  retrievability has little value.
- **Multiple named tokens** (one per device) — rejected: a list UI and
  per-token revocation for little gain; the same token pastes into every
  Claude client.
- **Fixed TTL** — rejected: Claude clients cannot refresh a static token,
  so every expiry would force a manual re-paste into each client.
  `last_used_at` gives leak visibility instead.
- **A profile page hosting the token section** — rejected: the app has no
  profile page, and this tiny UI does not justify inventing one.

## Consequences

- The token entity mirrors `refresh_tokens` (hash, unique index,
  `revoked_at`, `created_at`) minus `expires_at`, plus `last_used_at`.
- `TokenService.hash()` and the 32-byte base64url generator are reused
  as-is; only the `rvmcp_` prefix is new.
- A lost token is unrecoverable by design; the recovery path is regenerate
  and re-paste.
- Future account settings still have no home; the avatar menu remains the
  only account surface.

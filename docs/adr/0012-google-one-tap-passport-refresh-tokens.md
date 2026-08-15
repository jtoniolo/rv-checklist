# 12. Google One Tap + Passport, with rotating refresh tokens for long sessions

Date: 2026-07-19

## Status

Accepted

Refines [ADR-0002](0002-authentication-google-sso.md) (Google SSO with bearer JWT).
Amended by [ADR-0019](0019-cookie-token-transport.md).

## Context

ADR-0002 fixed the authentication *decision* — Google SSO producing a bearer JWT
that the NestJS API validates as a stateless resource server — but explicitly
left the *mechanism* as an implementation detail. Building the platform walking
skeleton (issue #13) forces those details:

- **How the owner signs in.** The owner does not want a redirect-heavy login and
  does not want to see a login screen again for months (Gmail-like).
- **How the first-party token is issued and validated** on the API.
- **How a months-long session stays alive** without weakening the
  "stateless resource server" posture.

## Decision

- **Sign-in uses Google One Tap** (Google Identity Services) in the browser. It
  yields a Google ID token with no redirect dance, which the web app POSTs to
  `POST /auth/google`.
- **The API uses NestJS Passport.** A custom strategy verifies the Google ID
  token server-side (against our OAuth client id) and upserts the owner; a
  `passport-jwt` strategy guards every other route, validating the bearer access
  token statelessly.
- **Two token kinds.** A **short-lived access JWT** (~15 min, HS256, signed with
  a server secret) is the bearer on every API call. A **long-lived refresh
  token** (~180 days) renews it. The web client refreshes silently ahead of
  expiry, so the owner effectively never re-authenticates.
- **Refresh tokens rotate and are revocable.** Only a SHA-256 hash is stored;
  each use revokes the presented token and issues a new one, recording the
  replacement so tokens are single-use. The recorded rotation chain is
  groundwork for reuse detection (revoking a whole chain when a spent token is
  replayed) — a later slice; today a spent token is simply rejected. Logout
  revokes.

## Alternatives considered

- **Auth.js on the Next tier** owning the OAuth flow — heavier and closer to the
  BFF posture ADR-0002 rejected for this app.
- **Full server-side OAuth redirect flow** (`passport-google-oauth20`) — more
  server plumbing and redirects; the owner explicitly wanted One Tap, and the
  browser should hold its own token from the first call.
- **Long-lived access tokens (no refresh)** — simplest, but not revocable and a
  months-long bearer is a large blast radius if leaked.
- **Server-side sessions** for longevity — reintroduces the session/BFF tier
  ADR-0002 rejected.

## Consequences

- A `users` table (the owner) and a `refresh_tokens` table exist from the first
  slice; refresh tokens are auth-endpoint credentials, **not** a resource-server
  session, so the API stays stateless for ordinary calls (ADR-0002 holds).
- The API needs a signing secret and the Google client id in its environment;
  the web needs the same client id and the API base URL (all via `.env`).
- Refresh-token rotation requires a small amount of persistence and a revocation
  path, paid for by revocable, low-blast-radius long sessions.
- Token refresh/expiry is handled entirely client-side, as ADR-0002 anticipated.

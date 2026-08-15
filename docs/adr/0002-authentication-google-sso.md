# 2. Authentication — Google SSO with bearer JWT

Date: 2026-07-16

## Status

Accepted

Amended by [ADR-0019](0019-cookie-token-transport.md)

## Context

The app is flat multi-user (see ADR-0003): every user signs in and owns their
own data. The web tier is SSR on a Cloudflare Worker and the API is NestJS in
k3s, so the browser and API are on different origins. The owner's stated
preference is to sign in with **Google**.

## Decision

- Authenticate with **Google SSO (OAuth 2.0 / OIDC)**.
- The browser holds a **bearer JWT** and sends it to the NestJS API on each
  request. NestJS validates the token as a **stateless resource server** — no
  server-side session, no BFF.
- Google's ID token is verified server-side once; a **short-lived first-party
  JWT** is then used for API calls, so the API trusts one issuer it controls.

## Alternatives considered

- **Session cookies** between browser and API — rejected. Cross-origin
  (Worker ↔ k3s) makes them third-party cookies (`SameSite=None`, and being
  phased out); bearer tokens avoid that and drop CSRF concerns.
- **NestJS/Passport owns the whole OAuth flow** — viable; deferred as an
  implementation detail rather than the architectural decision.
- **Cloudflare Access** as the auth gate — rejected (see ADR-0001).

## Consequences

- CORS on the API must allow the web origin.
- Token refresh/expiry handling is required.
- The token lives in the browser (standard SPA posture); the marginal XSS
  hardening of an httpOnly-cookie BFF was judged not worth a proxy tier.
- The exact issuer mechanism (Auth.js on the Worker vs. a Google client-side
  flow vs. NestJS-issued) is an implementation detail; see the research on the
  `research/google-sso-worker-nestjs` branch. The **decision** is fixed:
  Google SSO → bearer JWT validated by the API.

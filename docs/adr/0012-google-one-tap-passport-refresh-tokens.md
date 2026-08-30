# 12. Google One Tap with Passport, and refresh tokens that rotate, for long sessions

Date: 2026-07-19

## Status

Accepted.

This ADR refines [ADR-0002](0002-authentication-google-sso.md), which decided
Google SSO with a bearer JWT.

[ADR-0019](0019-cookie-token-transport.md) amends this ADR.

[ADR-0028](0028-offline-first-pwa-powersync.md) also amends this ADR. The
rotation gets a reuse interval of approximately 2 minutes. The refresh token that
the API replaced stays valid for that short period. Thus, if the network is
unreliable and the response of a rotation is lost, the session repairs itself and
does not end.

## Context

ADR-0002 fixed the authentication *decision*. Google SSO makes a bearer JWT, and
the NestJS API validates that JWT as a stateless resource server. But ADR-0002
intentionally left the *mechanism* as an implementation detail.

The work on the walking skeleton of the platform, in issue #13, needs those
details. There are three questions:

- **How does the owner sign in?** The owner does not want a login with many
  redirects. The owner also does not want to see a login screen again for months.
  The behavior must be similar to Gmail.
- **How does the API issue and validate the first-party token?**
- **How does a session stay alive for months?** The answer must not weaken the
  stateless resource server.

## Decision

- **The sign-in uses Google One Tap**, from Google Identity Services, in the
  browser. It gives a Google ID token with no sequence of redirects. The web
  application then sends that token in a `POST /auth/google` request.
- **The API uses NestJS Passport.** A custom strategy verifies the Google ID
  token on the server, against our OAuth client id, and then creates or updates
  the owner. A `passport-jwt` strategy protects each other route. That strategy
  validates the bearer access token and keeps no state.
- **There are two types of token.**
  - A **short-life access JWT**, valid for approximately 15 minutes. It uses
    HS256 and a secret on the server. It is the bearer token on each call to the
    API.
  - A **long-life refresh token**, valid for approximately 180 days. It renews
    the access JWT. The web client refreshes the token quietly before the
    expiry. Thus the owner does not authenticate again.
- **The refresh tokens rotate, and the API can revoke them.** The database holds
  a SHA-256 hash only. Each use revokes the token that the client sent and issues
  a new token. The API records the replacement, so each token has one use only.

  The recorded chain of rotations prepares for the detection of a reuse. The API
  will then revoke a full chain when a client sends a used token a second time.
  That is later work. At this time the API refuses a used token. A logout revokes
  the token.

## Alternatives that we compared

- **Auth.js in the Next tier controls the OAuth procedure.** This alternative is
  larger, and it is closer to the BFF structure that ADR-0002 rejected for this
  application.
- **A full OAuth redirect procedure on the server**, with
  `passport-google-oauth20`. This alternative needs more code on the server and
  more redirects. The owner wants One Tap. Also, the browser must hold its own
  token from the first call.
- **A long-life access token, with no refresh token.** This alternative is the
  most simple. But the API cannot revoke such a token, and a bearer token that is
  valid for months does much damage if a person gets it.
- **Sessions on the server**, to give a long life. This alternative adds the
  session tier and the BFF tier that ADR-0002 rejected.

## Consequences

- A `users` table and a `refresh_tokens` table exist from the first part of the
  work. A refresh token is a credential for the authentication endpoints. It is
  **not** a session on the resource server. Thus the API keeps no state for the
  usual calls, and ADR-0002 stays correct.
- The API needs a secret for the signature and the Google client id in its
  environment. The web application needs the same client id and the base URL of
  the API. All these values come from `.env`.
- The rotation of the refresh tokens needs a small quantity of storage and a
  procedure to revoke a token. In exchange, the long sessions can be revoked and
  do little damage.
- The client alone refreshes the token and reacts to an expiry. ADR-0002 expected
  this.

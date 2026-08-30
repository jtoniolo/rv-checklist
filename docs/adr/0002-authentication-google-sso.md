# 2. Authentication with Google SSO and a bearer JWT

Date: 2026-07-16

## Status

Accepted.

[ADR-0019](0019-cookie-token-transport.md) amends this ADR.

## Context

The application is flat and has more than one user. Refer to ADR-0003. Each user
signs in and owns the data of that user.

The web tier is SSR on a Cloudflare Worker. The API is NestJS in k3s. Thus the
browser and the API are on different origins.

The owner wants to sign in with **Google**.

## Decision

- Authenticate with **Google SSO**, which uses OAuth 2.0 and OIDC.
- The browser holds a **bearer JWT**. It sends the JWT to the NestJS API with
  each request.
- NestJS validates the token as a **stateless resource server**. There is no
  session on the server and no BFF.
- The server verifies the ID token from Google one time. The application then
  uses a **first-party JWT with a short life** for the calls to the API. Thus the
  API trusts one issuer, and the API controls that issuer.

## Alternatives that we compared

- **Session cookies between the browser and the API.** We rejected this
  alternative. The Worker and k3s are different origins, which makes the cookies
  third-party cookies. Such cookies need `SameSite=None`, and browsers are
  removing them. A bearer token prevents this problem and also removes the CSRF
  problem.
- **NestJS and Passport control the full OAuth procedure.** This alternative is
  possible. We did not decide it here, because it is an implementation detail and
  not an architecture decision.
- **Cloudflare Access as the authentication gate.** We rejected this alternative.
  Refer to ADR-0001.

## Consequences

- The CORS configuration on the API must permit the web origin.
- The application must refresh the token and must react to an expired token.
- The token is in the browser. This is the usual condition for an SPA. An
  httpOnly cookie with a BFF gives a small increase in protection against XSS. We
  decided that this increase does not justify a proxy tier.
- The exact mechanism of the issuer is an implementation detail. The options are
  Auth.js on the Worker, a Google procedure on the client, and a JWT that NestJS
  issues. The research is on the `research/google-sso-worker-nestjs` branch.

The **decision** does not change: Google SSO gives a bearer JWT, and the API
validates that JWT.

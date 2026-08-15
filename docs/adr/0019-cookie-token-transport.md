# 19. Cookie token transport

Date: 2026-08-15

## Status

Accepted

Amends [ADR-0002](0002-authentication-google-sso.md).
Amends [ADR-0012](0012-google-one-tap-passport-refresh-tokens.md).

## Context

ADR-0002 rejected session cookies because the Worker and the API were on
different origins — cookies between them would be third-party (`SameSite=None`,
being phased out). ADR-0012 placed both the access JWT and the refresh token
in the browser as bearer credentials, noting that the "marginal XSS hardening
of an httpOnly-cookie BFF was judged not worth a proxy tier."

The deployment topology has since been confirmed against the home lab IaC: the
API is a subdomain of the web host (`api.rv.<apex>` under `rv.<apex>`). They
share a common parent domain. Cookies scoped to `Domain=.rv.<apex>` are
first-party on both hosts, dissolving the cross-origin objection. With that
objection gone, httpOnly cookies are strictly better than browser-held bearer
tokens for XSS resistance — no proxy tier is required.

ADR-0018 introduces server-rendered signed-in pages; the server needs the
session token on the request to fetch data. Cookies deliver this automatically;
bearer tokens in browser storage do not.

## Decision

- **Access JWT (~15 min) and rotating refresh token (~180 days) are issued as
  httpOnly cookies by the API**, scoped to `Domain=.rv.<apex>`. Only the web
  host and its API subdomain ever receive them.
- **SameSite=Lax plus the CORS origin allowlist is the CSRF posture.** Lax
  cookies are not sent on cross-site sub-requests (POST from a third-party
  page); the CORS allowlist restricts which origins the API responds to.
  Together they replace the CSRF-token ceremony that `SameSite=None` would
  require.
- **Google One Tap remains the identity flow.** The browser still obtains a
  Google ID token and POSTs it to `POST /auth/google`. What changes is the
  response: the API sets cookies instead of returning tokens in the body.
- **Clean cut-over.** Body-token responses are removed when the web switches
  to cookies — no dual-mode window.
- **ADR-0012's rotation and revocation semantics are unchanged.** Refresh
  tokens still rotate on use, record replacements for reuse detection, and
  revoke on logout. Only the transport changes.

## Alternatives considered

- **Keep bearer tokens in browser storage** — the status quo per ADR-0002 and
  ADR-0012. Rejected because the cross-origin objection is dissolved, httpOnly
  cookies are strictly better for XSS resistance, and SSR page fetches
  (ADR-0018) need the token on the request automatically.
- **BFF proxy tier issuing cookies** — rejected for the same reason ADR-0002
  rejected it: the API subdomain relationship makes a proxy unnecessary.
- **`SameSite=Strict`** — rejected because it blocks cookies on navigations
  from external links (e.g. a bookmark in another app), breaking the welcome
  redirect flow.

## Consequences

- The API's cookie scope (`Domain=.rv.<apex>`) means tokens are never sent to
  other self-hosted services on sibling subdomains outside `.rv.<apex>`.
- Edge middleware (ADR-0018) can read the access cookie, check expiry, and
  silently refresh against the API, forwarding the new Set-Cookie to the
  browser — all without client-side refresh logic.
- The future React Native client uses the bearer extractor (ADR-0018's dual
  extractors), so cookie transport is web-only; no mobile work is implied.
- Client-side token storage and refresh-ahead logic are removed from the web
  app.

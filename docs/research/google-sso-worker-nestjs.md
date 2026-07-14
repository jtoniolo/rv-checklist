# Research: Google SSO across a Cloudflare Worker frontend + NestJS API

**Issue:** [#4](https://github.com/jtoniolo/rv-checklist/issues/4) · **Status:** research brief (no decision committed) · **Date:** 2026-07-14

## Context / constraints

- **Frontend:** Next.js deployed to a **Cloudflare Worker** (via `@opennextjs/cloudflare` / OpenNext).
- **API:** **NestJS** running in homelab **k3s**, on a *different origin* than the Worker (cross-origin / cross-site).
- **App shape:** flat multi-user, every user owns their own data. No org/tenant hierarchy, no admin-over-users. So the auth job is: *authenticate a human via Google, then attach a stable user id to every API call.*
- **IdP:** Google (OAuth 2.0 / OIDC).

The load-bearing decision is **where the OAuth flow + session live** and **how the NestJS API trusts the caller across the cross-site boundary.**

---

## TL;DR recommendation

**Run the OAuth/OIDC flow and session in Auth.js (NextAuth v5) on the Worker, and have the NestJS API authenticate each call with a bearer token in the `Authorization` header — not a cross-site cookie.**

Concretely:

1. **Auth.js on the Worker** handles the Google login redirect, callback, and the browser-facing session. Its own session cookie is *first-party* (Worker origin ↔ browser), so no cross-site cookie problem there.
2. For calls to the k3s API, the frontend sends a **bearer JWT** in `Authorization: Bearer …`. This sidesteps the entire SameSite/third-party-cookie minefield of the Worker↔k3s split.
3. **NestJS validates that JWT** on every request with a Passport `JwtStrategy` + `AuthGuard('jwt')`. The token is either (a) Google's **ID token**, verified against Google's JWKS, or (b) a **first-party JWT minted by your own backend** after it verifies Google once. Prefer (b) — see Q2.
4. Deploy the Worker with `@opennextjs/cloudflare` on the **Node.js runtime** (`nodejs_compat`), which removes most "Auth.js doesn't run at the edge" concerns.

**Cloudflare Access** is a strong *alternative* if you're willing to put the whole app behind Cloudflare's Zero Trust gateway and treat it as the identity layer — it's the least code but the most infrastructure lock-in and the least "own your login UX." Keep it as a fallback, not the default. See Q1.

---

## Q1 — Where should the OAuth flow and session live?

Three viable homes. Trade-offs for *this* split:

### Option A — Auth.js / NextAuth v5 on the Worker (recommended)

The Worker owns the OAuth dance and the browser session; the API is a pure resource server.

- **Pros**
  - Login UX and session cookie are **first-party to the Worker** → no cross-site cookie issues for the *session itself*.
  - Auth.js has a built-in Google provider and handles PKCE, state, nonce, token exchange for you. Import `Google` from `next-auth/providers/google`. ([Auth.js OAuth providers](https://authjs.dev/getting-started/authentication/oauth))
  - NextAuth v5 is **edge-aware** and works under `@opennextjs/cloudflare` on the Node.js runtime (Q3).
  - The API stays stateless and framework-agnostic — it just checks a bearer token.
- **Cons**
  - You must deliberately get a token *to* the API. Auth.js is browser-session-centric; exposing a token for a separate API means using the `jwt`/`session` callbacks to surface an `id_token`/`access_token`, or minting your own. This is the main integration cost.
  - If you ever want Auth.js to persist sessions in a DB adapter, most adapters are **not edge-compatible** and force the split-config pattern (Q3).

### Option B — NestJS owns OAuth (Passport `passport-google-oauth20` / `google-oidc`), issues its own JWT/session

The API runs the Google redirect/callback and mints a first-party session or JWT; the Worker frontend is a thin client.

- **Pros**
  - **Single source of truth for identity is your own backend** — cleanest for "users own their data," because user-provisioning, the `users` table, and token issuance all live in one place.
  - NestJS + Passport is well-trodden: a `GoogleStrategy` (`passport-google-oauth20`) whose verify callback receives `(accessToken, refreshToken, profile, done)`, then a `JwtStrategy` for subsequent calls. ([passport-google-oauth20](https://www.passportjs.org/packages/passport-google-oauth20/), [NestJS Passport recipe](https://docs.nestjs.com/recipes/passport))
  - No dependency on edge-runtime quirks for the auth logic — it's plain Node in k3s.
- **Cons**
  - The **OAuth redirect_uri now points at the k3s API**, so the login round-trip crosses origins, and if you want the resulting session in a **cookie** you hit the cross-site cookie problem (Q2). Workable if you return a **bearer JWT** to the SPA instead of a cookie.
  - The Worker frontend has to shuttle the browser to the API for login and back, which is a slightly clunkier UX than an in-app Auth.js route.

### Option C — Cloudflare Access in front of everything

Cloudflare's Zero Trust gateway authenticates users (Google as the upstream IdP) *before* traffic reaches the Worker or API, and injects a signed JWT.

- **Pros**
  - **Least application auth code.** Access does the Google OIDC dance; your app just trusts the injected identity.
  - Access sends a signed JWT as the `Cf-Access-Jwt-Assertion` header; your origin validates it against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` (JWKS), checking the `aud` tag for your app. ([Validate JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/))
  - Works for both the Worker and the homelab API (the k3s API can be published via Cloudflare Tunnel behind the same Access policy).
- **Cons**
  - **Infra lock-in + operational surface**: every user must pass through Cloudflare Access; the homelab API must be reachable through a Tunnel/Access policy rather than direct. Signing keys rotate ~every 6 weeks and you must track the JWKS.
  - You **don't own the login UX or the session model** — harder to do in-app "sign in" affordances, per-user onboarding, or anything Access doesn't model.
  - Overkill for a flat consumer-style multi-user app where users self-serve with their own Google accounts; Access is really built for gating internal/enterprise apps.

**Verdict:** Option A for the default (own your UX, keep API stateless), with Option B as a very reasonable alternative if you'd rather centralize identity in NestJS. Option C only if you want auth to be an infra concern rather than an app concern.

---

## Q2 — How does the API validate the caller?

### Session cookie vs bearer JWT across the Worker↔k3s boundary

This is the crux. The Worker (e.g. `app.example.com`) and the k3s API (e.g. `api.example.com` or a homelab host) are **different sites/origins**. A cookie sent from the browser to the API is therefore a **cross-site cookie**, which browsers now treat as a third-party cookie:

- A cross-site cookie **must** be `SameSite=None; Secure` to be sent at all; without `SameSite=None` it is simply not attached to cross-site requests, and `SameSite=None` **requires** `Secure`. ([MDN SameSite](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite))
- Even with `SameSite=None; Secure`, browsers are **actively phasing out third-party cookies** (Safari ITP already blocks them; Chrome has been restricting them). Relying on a cross-site session cookie is building on sand. ([MDN third-party cookies](https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies))
- You also can't share one cookie across `app.example.com` and `api.example.com` unless both are subdomains of a registrable parent and you set `Domain=example.com` — which is impossible if the homelab API isn't under the same parent domain.

**Consequence:** for the cross-origin call to the API, use a **bearer token in the `Authorization` header**, not a cookie. Bearer tokens are immune to SameSite rules, need explicit CORS (`Access-Control-Allow-Origin` for the Worker origin + `Allow-Headers: Authorization`), and are not auto-attached, which also removes CSRF exposure on the API. Keep cookies **first-party** to whichever server rendered the page (the Worker's own Auth.js session cookie is fine because it's same-site).

### Where Google's ID token gets verified

Google's OIDC ID token is a JWT. Verify it **server-side** (never trust an unverified token):

- Check the **signature** against Google's public keys (JWKS), the **`aud`** claim equals your OAuth client ID, the **`iss`** claim is `accounts.google.com` or `https://accounts.google.com`, and **`exp`** is in the future. ([Verify the Google ID token](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect))
- Google's signing keys rotate; honor the `Cache-Control` header on the certs endpoint when caching JWKS.

Two clean patterns:

1. **Backend re-mints (recommended).** Whoever runs the OAuth flow (Auth.js on the Worker, or NestJS) verifies Google's ID token **once**, provisions/looks-up the local user, and issues a **first-party JWT** signed with your own secret (short TTL). NestJS then validates *your* JWT with a `JwtStrategy` (`@nestjs/jwt`, `secretOrKey`, `jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken()`) behind `AuthGuard('jwt')`. ([NestJS Passport recipe](https://docs.nestjs.com/recipes/passport)) This decouples your API from Google's token format, lets you embed your own `sub`/roles, and controls TTL.
2. **API verifies Google's ID token directly.** The API's `JwtStrategy` points at Google's JWKS and checks `aud`/`iss`/`exp`. Fewer moving parts, but you inherit Google's token lifetime/format and can't easily add app claims.

### Refresh-token handling

- To get a **refresh token** from Google you must request `access_type=offline`, and to reliably get one on re-consent add `prompt=consent`. Refresh tokens are limited per client/user, and old ones can be evicted if you over-request. ([OpenID Connect / offline access](https://developers.google.com/identity/openid-connect/openid-connect))
- The refresh token is a **long-lived secret**: keep it **server-side only** (Auth.js session store or the NestJS DB), never in the browser. The browser should only ever hold a **short-lived** access/first-party JWT. If you mint your own JWTs you may not need Google refresh tokens at all unless you call Google APIs on the user's behalf — for pure login, re-authenticating via Google is often simpler than storing Google refresh tokens.
- If you use your own first-party JWTs, implement your **own** short-access-token + refresh flow (refresh token in an HttpOnly first-party cookie on the *issuer's* origin, or a refresh endpoint). Don't put a refresh token in a cross-site cookie.

---

## Q3 — Cloudflare Workers runtime compatibility (edge, no Node built-ins)

**Bottom line: this is a solved problem in 2026, provided you deploy via `@opennextjs/cloudflare` on the Node.js runtime.**

- With `@opennextjs/cloudflare`, your Next.js app runs on the Workers **Node.js runtime**, which exposes Node APIs. You must enable the **`nodejs_compat`** compatibility flag and set `compatibility_date` to **`2024-09-23` or later** (docs also suggest `global_fetch_strictly_public`). **Remove any `export const runtime = "edge"`** from your source. ([Cloudflare: Next.js on Workers](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/), [OpenNext Cloudflare](https://opennext.js.org/cloudflare/get-started))
- NextAuth **v5** is designed to be edge-compatible; running it on the Node.js runtime removes the historical friction. Google provider is supported.
- **The classic gotcha is the database adapter, not the OAuth logic.** Many Auth.js DB adapters (ORMs) aren't edge-compatible. Auth.js's documented fix is the **split-config pattern**: put shared, adapter-free options in `auth.config.ts`, force the **JWT session strategy**, and only initialize the full instance (with adapter) where a real DB is available; middleware/edge imports the adapter-free config. ([Auth.js Edge Compatibility](https://authjs.dev/guides/edge-compatibility)) For this app, using the **JWT session strategy with no DB adapter** on the Worker avoids the problem entirely — the durable user record lives in the NestJS/k3s database, not in an Auth.js adapter.
- If you *do* want edge-native storage, Cloudflare's **D1 adapter** exists, and lazy-initialization from `event.platform` env is the documented approach. ([Auth.js D1 adapter](https://authjs.dev/getting-started/adapters/d1)) Not needed here.

**Net:** Auth.js runs fine on the Worker for this use case if you (a) build with OpenNext on the Node runtime, (b) use the JWT session strategy without a DB adapter, and (c) keep the durable user store in the API's database.

---

## Recommendation (expanded)

1. **Auth.js (NextAuth v5) on the Worker**, Google provider, **JWT session strategy, no DB adapter**. Build with `@opennextjs/cloudflare` (`nodejs_compat`, `compatibility_date >= 2024-09-23`, no `runtime = "edge"`).
2. On first login, Auth.js verifies Google's ID token; in the `jwt`/`session` callback, look up/provision the user **in the NestJS DB** (a small backend endpoint the Worker calls) and mint a **first-party JWT** for API calls.
3. **NestJS = resource server:** `JwtStrategy` + `AuthGuard('jwt')`, validating your first-party JWT from the `Authorization: Bearer` header. CORS allows the Worker origin and the `Authorization` header.
4. **No cross-site cookies to the API.** Auth.js's session cookie stays first-party to the Worker; the API is reached only with bearer tokens.
5. Keep any Google **refresh token server-side**; for pure login you likely don't need to store it — re-auth via Google is simpler than managing Google refresh tokens.

If you'd rather have **one identity brain**, flip to **Option B**: NestJS runs Passport `google-oauth20`, verifies Google, mints the first-party JWT, and the Worker frontend just holds/sends that bearer token. Same API-side validation, same "no cross-site cookie" rule. Choose A vs B on where you want the login UX and provisioning logic to live.

---

## Open caveats / things to confirm before building

- **Getting a token from Auth.js to the API cleanly.** Auth.js is session-first; the exact mechanism to expose a bearer token to a *separate* API (custom `jwt`/`session` callback vs a dedicated token endpoint) needs a spike. This is the single biggest unknown in Option A.
- **User provisioning boundary.** Decide whether the Worker calls the API to create the user row during the Auth.js callback, or the API does provisioning when it first sees a valid Google-verified identity. Keep the `users` table authoritative in one place.
- **Homelab API reachability + TLS.** Bearer + CORS assumes the k3s API is reachable over HTTPS from the browser (valid cert, correct CORS). Confirm ingress/cert setup for the homelab origin (or front it with a Cloudflare Tunnel).
- **JWKS caching/rotation.** Whether you verify Google ID tokens or Cloudflare Access JWTs, honor key rotation (Google via `Cache-Control`; Access rotates ~6 weeks).
- **Token lifetime & logout.** First-party JWTs are stateless — plan short TTLs and a refresh path, and decide how "logout" / revocation works (a deny-list or short TTL) since you can't invalidate a stateless JWT server-side by default.
- **Cloudflare Access is still on the table** if you decide auth should be infrastructure, not app code — revisit if requirements shift toward centralized access policies.

---

## Sources (primary)

- Auth.js — Edge Compatibility (split config, JWT strategy, adapter caveats): https://authjs.dev/guides/edge-compatibility
- Auth.js — OAuth / Google provider: https://authjs.dev/getting-started/authentication/oauth
- Auth.js — Cloudflare D1 adapter (lazy init from `event.platform`): https://authjs.dev/getting-started/adapters/d1
- Cloudflare Workers — Next.js framework guide (`nodejs_compat`, compatibility date, remove `runtime="edge"`): https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- OpenNext — Cloudflare get-started: https://opennext.js.org/cloudflare/get-started
- Cloudflare One — Validate Access JWTs (`Cf-Access-Jwt-Assertion`, certs endpoint, `aud`, 6-week rotation): https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- Google Identity — OpenID Connect (endpoints, `access_type=offline`, `prompt=consent`, ID token claims): https://developers.google.com/identity/openid-connect/openid-connect
- Google Identity — Verify the Google ID token server-side (`aud`/`iss`/`exp`, JWKS, cert caching): https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- NestJS — Passport recipe (JwtStrategy, `AuthGuard`, bearer extraction): https://docs.nestjs.com/recipes/passport
- Passport — `passport-google-oauth20` (verify callback signature, config): https://www.passportjs.org/packages/passport-google-oauth20/
- MDN — SameSite cookies (`SameSite=None; Secure` required for cross-site): https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie/SameSite
- MDN — Third-party cookies / phase-out: https://developer.mozilla.org/en-US/docs/Web/Privacy/Guides/Third-party_cookies

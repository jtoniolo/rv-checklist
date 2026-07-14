# Next.js on Cloudflare Workers calling a homelab k3s API

**Status:** Research brief (decision input, not a decision)
**Date:** 2026-07-14
**Question (issue #3):** How do you host a Next.js app on a Cloudflare Worker and have it
talk to a NestJS API running in a private homelab k3s cluster?

This brief surfaces the facts a deploy-topology decision waits on. Sourced from official
Cloudflare / Next.js / OpenNext docs (URLs inline). Some Cloudflare doc pages were not
directly fetchable from this environment; those facts are corroborated across the official
Cloudflare blog, OpenNext docs, and the GitHub project.

---

## TL;DR recommendation

1. **Use `@opennextjs/cloudflare` (OpenNext) on Cloudflare Workers.** It is the current,
   recommended path as of 2026. `@cloudflare/next-on-pages` (the Pages adapter) is
   deprecated. Build with the **App Router** and the **Node.js runtime**.
2. **Keep the NestJS API private.** Expose it from k3s with a **Cloudflare Tunnel**
   (`cloudflared` running in the cluster), fronted by **Cloudflare Access**. No inbound
   ports, no publicly routable origin.
3. **Call the API server-side** from the Worker (RSC / Route Handlers), authenticating the
   hop with a **Cloudflare Access service token** (or mTLS). This removes CORS from the
   picture and keeps credentials off the browser. If the browser must call the API, proxy
   through a same-origin Next.js Route Handler rather than calling the homelab cross-origin.

---

## 1. Running Next.js on Cloudflare Workers: OpenNext vs next-on-pages

### Which is current (2026)

- **`@opennextjs/cloudflare` (OpenNext adapter → Workers) is the recommended approach.** It
  is the path recommended by both Cloudflare and the Next.js team, and Cloudflare is
  building its own official adapter *on top of* OpenNext, shipping during 2026.
  - Cloudflare framework guide: <https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/>
  - OpenNext Cloudflare docs: <https://opennext.js.org/cloudflare>
  - Cloudflare blog announcement: <https://blog.cloudflare.com/deploying-nextjs-apps-to-cloudflare-workers-with-the-opennext-adapter/>
- **`@cloudflare/next-on-pages` (Pages adapter) is deprecated.** Cloudflare directs new
  Next.js projects to OpenNext + Workers instead of Pages.
  - <https://github.com/cloudflare/next-on-pages>
  - Cloudflare Pages Next.js guide (now points at OpenNext): <https://developers.cloudflare.com/pages/framework-guides/nextjs/>
- **Maturity:** OpenNext for Cloudflare reached **1.0 GA in February 2026** and works against
  unmodified **Next.js 14.x and 15.x** builds.

### Key runtime difference

| | `@opennextjs/cloudflare` (Workers) | `@cloudflare/next-on-pages` (Pages, deprecated) |
|---|---|---|
| Next.js runtime | **Node.js runtime** (full Node APIs via Workers `nodejs_compat`) | **Edge runtime only** |
| Feature coverage | Broad; the reason it's recommended | Narrow; limited to Edge-compatible code |
| Status | Current / recommended | Deprecated |

### Feature support on OpenNext + Workers (Node runtime)

**Supported:**
- **App Router** (Next.js 13+), **Route Handlers**, **dynamic routes**
- **Server-Side Rendering (SSR)** and **React Server Components (RSC)**
- **Static Site Generation (SSG)**
- **Middleware** (edge middleware)
- **Incremental Static Regeneration (ISR)** — backed by **Cloudflare KV** by default;
  the adapter also ships override modules for **R2 cache**, a **regional cache** (Workers
  Cache API layer in front of KV), and a **Durable Object** cache.
  - <https://opennext.js.org/cloudflare/caching>

**Not (fully) supported / caveats:**
- **Pages Router** — use the App Router instead.
- **Node Middleware** (the `nodejs` middleware runtime introduced in Next.js 15.2) — not yet
  supported.
- **Edge runtime routes** — the adapter targets the Node runtime; remove
  `export const runtime = "edge"` from routes.
- **Image optimization** — Next's default optimizer isn't provided; integrate **Cloudflare
  Images** instead.
- General Workers platform limits still apply (CPU time, subrequest counts, bundle size).

> Practical read: build App-Router + Node-runtime and you're on the supported happy path.
> Every SSR/RSC request that reaches back to the homelab API runs inside the Worker's
> request/CPU budget, so keep server-side calls lean.

---

## 2. How a Worker-hosted frontend reaches a PRIVATE homelab API

The Worker runs on Cloudflare's edge; the k3s cluster is on a home network with no
guaranteed public IP. Three patterns, roughly in order of preference for a private homelab:

### Option A — Cloudflare Tunnel (`cloudflared`) → k3s, fronted by Access  *(recommended)*
- Run `cloudflared` **inside the cluster** (as a Deployment adjacent to the app, so it
  scales independently), pointing at either a Kubernetes **Service** directly or the
  cluster **ingress**.
- **No inbound ports are opened**; the tunnel dials *out* to Cloudflare. The origin is never
  publicly routable.
- **TLS:** Cloudflare terminates TLS at its edge and manages the public cert; the
  `cloudflared`→service leg is inside your network. You do not need a public cert on the
  homelab.
- Put a **Cloudflare Access** policy in front so only authenticated callers (your Worker via
  a service token) reach it.
- Docs: Kubernetes tunnel deployment guide
  <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/deployment-guides/kubernetes/>

### Option B — Public ingress with TLS  *(traditional, more exposure)*
- ingress-nginx + cert-manager (Let's Encrypt) + public DNS + router port-forward/firewall.
- Requires **opening inbound ports** and exposing the origin IP; you own DDoS/patching risk.
- Works, but for a homelab this is strictly more attack surface than a tunnel. Only choose
  it if you specifically want a public API independent of Cloudflare.

### Option C — Worker → Tunnel binding via **Workers VPC**  *(newest; beta)*
- **Workers VPC Services / VPC Networks** let a Worker bind directly to a specific
  **private host:port** reachable over a Cloudflare Tunnel — **no public hostname required**.
  You register the target as a VPC Service and call it from the Worker via a binding.
- Note: the VPC Service's configured host/port is what actually routes; the host in the
  `fetch()` URL is ignored. VPC Networks is the broader-scope variant where the fetch URL
  controls routing.
- **Status: beta as of 2026** — APIs may change before GA.
- Docs: <https://developers.cloudflare.com/workers-vpc/> ·
  <https://developers.cloudflare.com/workers-vpc/configuration/tunnel/> ·
  <https://developers.cloudflare.com/workers-vpc/examples/private-api/>

### Authenticating the Worker → API hop

- **Cloudflare Access service tokens** (machine-to-machine): the Worker sends
  `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers; Access validates and issues a
  scoped JWT (`CF_Authorization`). Store the secret as a Worker secret binding.
  - <https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/>
- **mTLS from the Worker**: upload a client cert/key with `wrangler`, add an
  `mtls_certificates` binding, and attach it to `fetch()` (`env.MY_CERT.fetch(...)`). Good
  when the origin enforces mutual TLS.
  - <https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/>
- **Workers VPC binding** (Option C): connectivity is private, so there's no public endpoint
  to attack — but still layer app-level auth (e.g. a bearer token the NestJS API checks).
- Ordering note: on Cloudflare, **Access runs before your Worker code**. For the Worker→API
  hop you're the *client* of Access at the homelab side, so the service-token pattern is the
  clean fit.

---

## 3. Server-side vs client-side API calls, and CORS

### Server-side (Worker RSC / Route Handler → API)  *(recommended)*
- The request originates from the **Worker/server**, not the browser, so **the browser
  same-origin policy / CORS does not apply**. No `Access-Control-Allow-Origin` gymnastics.
- Auth credentials (Access service token, mTLS cert) stay **server-side** — never shipped to
  the browser. Server-side fetches also don't bloat the client bundle.
- Only viable path if you use Option C (Workers VPC) or Worker-held secrets, since the
  browser can't reach a private host or hold those secrets.

### Client-side (browser → API directly)  *(discouraged here)*
- Subject to **CORS**: the NestJS API must return `Access-Control-Allow-Origin` for the
  Worker's public origin and handle preflight (`OPTIONS`). Next.js API/Route Handlers are
  **same-origin only by default** — CORS is something you'd have to add deliberately.
- Requires the API to have a **public hostname** the browser can resolve, and exposes the
  endpoint (and any token) to the client.

### The clean pattern
- Do the private-API calls **server-side** in RSC / Route Handlers on the Worker.
- If the browser genuinely needs to trigger a call, **proxy it through a Next.js Route
  Handler on the same Worker origin** (same-origin → no CORS), and have that handler forward
  server-side to the homelab API with the Access service token / mTLS. One place to hold
  secrets, no cross-origin config, no credentials in the browser.
- References: Next.js API routes are same-origin by default
  <https://nextjs.org/docs/pages/building-your-application/routing/api-routes> ·
  CORS-in-Next.js overview <https://blog.logrocket.com/using-cors-next-js-handle-cross-origin-requests/>

---

## Open caveats / things to verify before committing

- **Workers VPC is beta** (Option C). If you want a stable answer today, Option A (Tunnel +
  Access + server-side service-token calls) is the safe, GA choice.
- **ISR requires deliberate cache config** (KV by default; R2 / regional / DO overrides).
  Confirm which caching store you want and its cost profile.
- **Node Middleware and Edge-runtime routes are unsupported** on the OpenNext adapter — audit
  the app for `runtime = "edge"` and Node-middleware usage.
- **Cloudflare's official adapter is still evolving in 2026** (built on OpenNext) — expect
  churn; pin versions.
- **Homelab availability & latency directly affect SSR.** Every SSR/RSC render that calls the
  API blocks on the tunnel round-trip; a downed cluster degrades the site. Consider caching /
  graceful fallbacks for server-rendered data.
- **Image optimization** needs the Cloudflare Images integration, not Next's default.

## Primary sources

- Cloudflare — Next.js on Workers: <https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/>
- OpenNext — Cloudflare adapter: <https://opennext.js.org/cloudflare>
- OpenNext — Caching (ISR): <https://opennext.js.org/cloudflare/caching>
- Cloudflare blog — OpenNext adapter: <https://blog.cloudflare.com/deploying-nextjs-apps-to-cloudflare-workers-with-the-opennext-adapter/>
- Cloudflare — `next-on-pages` (deprecated): <https://github.com/cloudflare/next-on-pages>
- Cloudflare One — Tunnel on Kubernetes: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/deployment-guides/kubernetes/>
- Cloudflare One — Access service tokens: <https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/>
- Cloudflare Workers — mTLS binding: <https://developers.cloudflare.com/workers/runtime-apis/bindings/mtls/>
- Cloudflare Workers VPC (Tunnel binding, beta): <https://developers.cloudflare.com/workers-vpc/> · <https://developers.cloudflare.com/workers-vpc/configuration/tunnel/> · <https://developers.cloudflare.com/workers-vpc/examples/private-api/>
- Next.js — API routes (same-origin default): <https://nextjs.org/docs/pages/building-your-application/routing/api-routes>

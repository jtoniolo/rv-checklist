# 1. Deployment and connectivity topology

Date: 2026-07-16

## Status

Superseded by [ADR-0018](0018-true-hybrid-ssr-web-architecture.md) (web-tier and data-path) and [ADR-0020](0020-public-repo-deployment-split.md) (topology)

## Context

The app is a personal, pull-based RV checklist + maintenance tracker, deployed
onto the operator's self-hosted infrastructure, which runs **k3s**, uses **CloudNativePG (CNPG)** for
Postgres, keeps secrets in **Vault**, and already exposes self-hosted services
to the internet through **Cloudflare Tunnels**, one
hostname per service. The stack is an Nx monorepo with a **NestJS** API and a
**Next.js** web app. We need to decide where each tier runs and how they connect.

## Decision

- **Web** — Next.js with **SSR**, deployed to a **Cloudflare Worker** (via
  OpenNext / `@opennextjs/cloudflare`). The Worker renders the app; it is **not
  a BFF** and does not proxy API traffic.
- **API** — **NestJS in k3s**, exposed on its own hostname via a **Cloudflare
  Tunnel** (`cloudflared`), exactly like the operator's other self-hosted services. **No
  Cloudflare Access** in front — the hostname is public and protected by JWT
  auth only.
- **Data path** — the **browser calls the API directly** (bearer JWT; CORS
  allows the web origin). The Worker SSRs the page shell; **authenticated data
  is fetched client-side**. The Worker holds no server-side session.
- **Config / secrets** — application **secrets live in Vault**; non-secret
  configuration lives in a **ConfigMap**. Database credentials come from CNPG's
  generated app secret, surfaced through the existing Vault flow.
- **Database** — CloudNativePG; the app connects to the `<cluster>-rw` service.
  **TypeORM migrations run automatically at application startup.**
- **Backups** — none for now.

## Alternatives considered

- **Next.js as an edge-Worker BFF** proxying the API over the tunnel — rejected.
  It adds a second deployment model and a Worker→origin hop for every dynamic
  call, buying edge locality this personal, one-to-few-user app does not need.
- **Static SPA, no SSR** — rejected; SSR on a Worker was a deliberate choice.
- **Cloudflare Access in front of the API** — rejected; JWT validation at the
  API is sufficient, and Access adds infra for no benefit here.

## Consequences

- Deployment matches the established "service in k3s, Cloudflare
  Tunnel out" pattern; only the web tier lives at the edge.
- SSR renders the shell fast; authenticated content depends on client-side
  fetches to the self-hosted API, so app availability is tied to its uptime
  (acceptable — same as every other self-hosted service).
- CORS must be configured on the API to allow the web origin.
- No database backups is a known, accepted risk to revisit; CNPG can schedule
  backups to object storage when wanted.

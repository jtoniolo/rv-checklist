# 1. Deployment and connectivity structure

Date: 2026-07-16

## Status

[ADR-0018](0018-true-hybrid-ssr-web-architecture.md) supersedes the web tier and
the data path. [ADR-0020](0020-public-repo-deployment-split.md) supersedes the
structure. [ADR-0031](0031-web-tier-to-k3s-container.md) supersedes the web-tier
host: the web tier leaves the Cloudflare Worker and runs as a container in k3s
behind the Cloudflare Tunnel, the same as the API.

## Context

The application is a personal, pull-based RV checklist and maintenance tracker.
It deploys onto the infrastructure of the operator, who hosts it.

That infrastructure runs **k3s**. It uses **CloudNativePG (CNPG)** for Postgres.
It keeps the secrets in **Vault**. It already gives the internet access to the
services of the operator through **Cloudflare Tunnels**, with one hostname for
each service.

The application is an Nx monorepo with a **NestJS** API and a **Next.js** web
application. We must decide where each tier operates and how the tiers connect.

## Decision

- **Web**: Next.js with **SSR**, deployed to a **Cloudflare Worker** through
  OpenNext (`@opennextjs/cloudflare`). The Worker renders the application. The
  Worker is **not a BFF** and does not proxy the traffic to the API.
- **API**: **NestJS in k3s**, on its own hostname through a **Cloudflare
  Tunnel** (`cloudflared`). This is the same method as the other self-hosted
  services of the operator. There is **no Cloudflare Access** in front of the
  API. The hostname is public, and JWT authentication is the only protection.
- **Data path**: the **browser calls the API directly** with a bearer JWT. CORS
  permits the web origin. The Worker renders the shell of the page on the
  server. The browser gets the **authenticated data on the client**. The Worker
  holds no session on the server.
- **Configuration and secrets**: the **secrets of the application are in
  Vault**. The configuration that is not secret is in a **ConfigMap**. The
  credentials of the database come from the application secret that CNPG makes,
  through the existing Vault procedure.
- **Database**: CloudNativePG. The application connects to the `<cluster>-rw`
  service. **The TypeORM migrations run automatically when the application
  starts.**
- **Backups**: none at this time.

## Alternatives that we compared

- **Next.js as a BFF in an edge Worker**, with a proxy to the API through the
  tunnel. We rejected this alternative. It adds a second deployment model. It
  also adds one hop from the Worker to the origin for each dynamic call. It
  gives locality at the edge, and this personal application, with one user or a
  small number of users, does not need that locality.
- **A static SPA with no SSR.** We rejected this alternative. SSR on a Worker
  was an intentional decision.
- **Cloudflare Access in front of the API.** We rejected this alternative. The
  JWT validation at the API is sufficient. Access adds infrastructure and gives
  no benefit here.

## Consequences

- The deployment agrees with the usual pattern of the operator: a service in k3s
  with a Cloudflare Tunnel to the internet. Only the web tier operates at the
  edge.
- SSR renders the shell quickly. The authenticated content needs requests from
  the client to the self-hosted API. Thus the availability of the application
  depends on the availability of that API. This is acceptable, because it is the
  same for each other self-hosted service.
- The API must have a CORS configuration that permits the web origin.
- The absence of database backups is a known risk. We accept the risk now and
  will examine it again. CNPG can write scheduled backups to object storage when
  we want them.

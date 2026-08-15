# 20. Public-repo / home lab deployment split

Date: 2026-08-15

## Status

Accepted

Supersedes [ADR-0001](0001-deployment-and-connectivity.md) (topology).

## Context

The owner intends to publish this repo as a portfolio piece. ADR-0001 described
the deployment topology — SSR Worker, NestJS in k3s via Cloudflare Tunnel —
but the repo already contains references to the home lab's specific hosts,
accounts, and Cloudflare configuration. Publishing it would expose home lab
infrastructure details.

At the same time, the deployment target (a Cloudflare Worker via OpenNext for
the web, k3s for the API) remains correct. The question is where the boundary
sits between generic build configuration (portable, safe to publish) and
environment-specific infrastructure (DNS records, custom-domain attachment,
tunnel routes, env injection).

## Decision

- **This repo carries only generic build configuration.** OpenNext and wrangler
  config files describe *how* to build and bundle the Worker, but contain no
  hostnames, Cloudflare account IDs, route patterns, or environment values.
  Public build-time values are injected at build time by the CI job that runs
  in the home lab repo.
- **The home lab IaC repo owns all environment-specific deployment.**
  Terraform declares DNS records and custom-domain attachment. A CI job in that
  repo checks out this repo at a release tag, injects the real environment
  (public build-time values are inlined at build, so the build runs where the
  env lives), builds with OpenNext, and uploads the result with wrangler.
  Terraform declares where the Worker lives; wrangler puts the code there.
- **No home-lab-identifying content in this repo.** Hostnames, account IDs,
  tunnel UUIDs, route patterns, and env values must not appear in source,
  configuration, CI files, or documentation.

## Alternatives considered

- **Keep deployment config in this repo, strip secrets before publishing** —
  rejected. Scrubbing is error-prone, and any missed reference leaks home lab
  infrastructure. A clean split is safer than a filter.
- **Monorepo containing both app and IaC** — rejected. The IaC repo manages
  many home lab services; folding one app into it would break its scope, and
  folding all IaC into this repo would make it unpublishable.
- **Environment-variable-only separation (config in repo, values external)** —
  partially adopted (wrangler config is generic), but hostnames in Terraform
  resources and CI scripts still belong in the IaC repo, not here.

## Consequences

- Publishing this repo requires no scrubbing — it is clean by construction.
- Deploying the app requires the home lab IaC repo's CI pipeline; this repo
  alone cannot deploy to a live environment.
- Release tags in this repo are the contract between the two repos: the IaC
  CI job checks out a tag, builds, and deploys.
- Contributors (or the owner on a new machine) can develop and test locally
  with `.env` files without needing the home lab IaC repo.

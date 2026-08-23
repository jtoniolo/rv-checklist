# 20. Public repo / private deployment split

Date: 2026-08-15

## Status

Accepted

Supersedes [ADR-0001](0001-deployment-and-connectivity.md) (topology).

## Context

The owner intends to publish this repo as a portfolio piece. ADR-0001 described
the deployment topology — SSR Worker, NestJS in k3s via Cloudflare Tunnel —
but a public repo must not carry environment-specific detail: hosts, accounts,
or provider configuration identify the operator's infrastructure.

At the same time, the deployment target (a Cloudflare Worker via OpenNext for
the web, k3s for the API) remains correct. The question is where the boundary
sits between generic build configuration (portable, safe to publish) and
environment-specific infrastructure (DNS records, custom-domain attachment,
tunnel routes, env injection).

## Decision

- **This repo carries only generic build configuration.** OpenNext and wrangler
  config files describe *how* to build and bundle the Worker, but contain no
  hostnames, Cloudflare account IDs, route patterns, or environment values.
  Public build-time values are injected at build time by the CI job that
  deploys.
- **A private repository owns all environment-specific deployment.** It
  declares DNS records and custom-domain attachment, checks out this repo at a
  release tag, injects the real environment (public build-time values are
  inlined at build, so the build runs where the env lives), builds with
  OpenNext, and uploads the result with wrangler. This repo never references
  that repository beyond this generic statement.
- **No environment-identifying content in this repo.** Hostnames, account IDs,
  tunnel UUIDs, route patterns, env values, and any naming that identifies the
  operator's infrastructure must not appear in source, configuration, CI
  files, documentation, or the issue tracker.

## Alternatives considered

- **Keep deployment config in this repo, strip secrets before publishing** —
  rejected. Scrubbing is error-prone, and any missed reference leaks
  infrastructure detail. A clean split is safer than a filter.
- **Monorepo containing both app and IaC** — rejected. The private repository
  manages more than this app; folding one app into it would break its scope,
  and folding all IaC into this repo would make it unpublishable.
- **Environment-variable-only separation (config in repo, values external)** —
  partially adopted (wrangler config is generic), but hostnames in
  infrastructure resources and CI scripts still belong in the private
  repository, not here.

## Consequences

- Publishing this repo requires no scrubbing — it is clean by construction.
- This repo alone cannot deploy to a live environment; deployment happens
  from the private repository's CI pipeline.
- Release tags in this repo are the contract between the two repos: the
  deploying CI job checks out a tag, builds, and deploys.
- Contributors (or the owner on a new machine) can develop and test locally
  with `.env` files without needing anything beyond this repo.

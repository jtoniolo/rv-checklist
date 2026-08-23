# Deployment

This repo builds; a private repository deploys ([ADR-0020](adr/0020-public-repo-deployment-split.md)).
This document is the whole public half of that contract: everything a deploying
repository needs to reference, with no environment specifics. Hostnames,
account IDs, routes, and real env values live only in the deploying
repository — as do its work items. Environment-specific tasks are never filed
in this repo's issue tracker.

## Components

A full deployment runs:

| Component | Artifact | Source of truth |
| --- | --- | --- |
| Web | Cloudflare Worker built with OpenNext | `apps/web/wrangler.jsonc` (environment-blind) |
| API | Container image `ghcr.io/jtoniolo/rv-checklist-api:X.Y.Z` | `apps/api/Dockerfile`, published by `cd.yml` |
| API chart | `oci://ghcr.io/jtoniolo/charts/rv-checklist-api` version `X.Y.Z` | `charts/api/` ([README](../charts/api/README.md)) |
| Database | Postgres; the app runs its TypeORM migrations at startup | `libs/api/data-access` migrations |
| Object storage | S3-compatible (Garage) bucket for attachments and photos | ADR-0007, ADR-0026 |
| Google credentials | OAuth client (id + secret) and a Maps Platform API key | `.env.example` documents each |

## Release contract

A git tag `vX.Y.Z` produces image and chart at the same version; chart `X.Y.Z`
always deploys image `X.Y.Z` — they cannot disagree. The deploying repository
pins a release tag: it checks out this repo at that tag for the web build and
consumes the published image/chart for the API.

## Web

Build and deploy, with the deployer supplying every environment-specific value
via CI variables and its own wrangler config:

```sh
npx opennextjs-cloudflare build
npx wrangler deploy --config apps/web/<deployer-config>.jsonc
```

The worker name fits on the command line (`--name`), but routes and custom
domains have no wrangler CLI flag — they can only come from a config file. The
deployer therefore keeps its own environment-specific wrangler config (name,
routes/custom domains) and places it next to `apps/web/wrangler.jsonc` before
deploying: wrangler resolves `main` and `assets.directory` relative to the
config file, so the paths from the environment-blind config only work from
that directory.

Required at build time (inlined into the bundle):

- `NEXT_PUBLIC_API_BASE_URL` — public API origin, e.g. `https://api.example.com/api`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` — Google OAuth client id

DNS belongs to the deployer.
The service worker (`public/sw.js`, ADR-0028) is a build output served as a
static asset; it needs `max-age=0, must-revalidate` response headers (declared
in `public/_headers` once built — nothing extra to configure).

## API

`charts/api/values.yaml` declares the full contract: non-secret env vars under
`config`, required secret keys under `secretKeys`. The chart README documents
each key and the install command. The chart creates no Secret; the deployer
points `existingSecret` at one its platform materialises.

A contract test (`apps/api/src/app/config/env-chart-contract.spec.ts`) fails CI
when the API requires an env var the chart does not declare — so this document
and the chart cannot silently drift from the code. Any change that adds a
required env var updates the chart, its README, and `.env.example` in the same
change, plus a deploy note for the operator (see `CONTEXT.md`, Deployment
contract).

## Database

Postgres, supplied by the deployer as a single `DATABASE_URL` secret.
Migrations run automatically at API startup; no manual migration step exists.

### Offline sync (planned — lands with ADR-0028 / issue #145)

The offline architecture adds requirements the deployer must provide when that
release ships; #145 finalises the details and updates this document:

- `wal_level=logical` on Postgres (restart required), a replication role, and a
  `powersync` publication covering only the synced tables.
- A PowerSync sync-service container (`journeyapps/powersync-service`) with
  Postgres bucket storage (service ≥ 1.3.8) and a daily compact job; sizing
  guidance ~1 GB / 1 vCPU.
- Sync-service auth wiring to the API's token endpoint (key material via the
  same secret mechanism as the chart).

## Local development

None of the above is needed locally: copy `.env.example` to `.env` and run the
Nx targets. This repo alone builds, tests, and runs the whole stack against a
local Postgres.

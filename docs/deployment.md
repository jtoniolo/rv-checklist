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
| PowerSync (optional) | Sync service in the API chart, gated by `powersync.enabled` | `charts/api/` PowerSync templates, ADR-0028 |
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
pnpm install --frozen-lockfile
npx opennextjs-cloudflare build
npx wrangler deploy --config apps/web/<deployer-config>.jsonc
```

The install is part of the build, not setup that happens to come first: `apps/web`
copies the PowerSync SDK's worker and wasm into `apps/web/public/@powersync/`
from its `postinstall` (they are gitignored, and they belong to the installed
SDK version — ADR-0029, decision 8). OpenNext deploys `public/` as
`.open-next/assets`, and the browser loads the worker from `/@powersync/worker.js`
at runtime. Installing with `--ignore-scripts` therefore ships a worker-less
bundle: every page still renders and every read still reaches the API, but the
local store never opens and offline reads do not work — the browser console
carries one warning per page saying so.

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

### Offline sync (ADR-0028 / issue #145)

The PowerSync sync service ships inside the API chart, gated by
`powersync.enabled` (default `false`): a single-replica Deployment
(`journeyapps/powersync-service`, Postgres bucket storage — no MongoDB), a
ClusterIP Service on 8080, and a daily bucket-compact CronJob. Sizing guidance
is ~1 GB / 1 vCPU. Sync rules ship in the chart; the `powersync` publication
is created by the app's migrations at startup, so it always matches the
schema. What the deployer provides:

- `wal_level=logical` on the app's Postgres (a server restart, not a re-init —
  existing data is untouched).
- A replication role the service connects as, with `SELECT` on the published
  tables (the migrations run as the app's own user, which must own the tables
  it publishes — it does, having created them):

  ```sql
  CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD '...';
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO powersync_role;
  ```

- A separate database for sync bucket storage (same server is fine on
  Postgres 14+), owned by a dedicated role; the service creates its own
  schema there:

  ```sql
  CREATE ROLE powersync_storage WITH LOGIN PASSWORD '...';
  CREATE DATABASE powersync_storage OWNER powersync_storage;
  ```

- Three additions to the chart's secret/config contract (see the [chart
  README](../charts/api/README.md)): `POWERSYNC_JWT_SECRET` (always required
  by the API — the shared HS256 key, base64url-encoded, that
  `GET /auth/powersync-token` signs with and the service validates against),
  plus `POWERSYNC_DATA_SOURCE_URI` and `POWERSYNC_STORAGE_URI` in
  `existingSecret` when `powersync.enabled`.
- A public route to the powersync Service, and its origin in
  `config.POWERSYNC_URL` — the endpoint the API hands to clients.

## Local development

None of the above is needed locally: copy `.env.example` to `.env` and run the
Nx targets. This repo alone builds, tests, and runs the whole stack against a
local Postgres — `tools/dev/docker-compose.yml` brings up Postgres (already at
`wal_level=logical`) and the PowerSync sync service, bootstrapping the
replication and storage roles itself; the publication appears the first time
the API runs its migrations. A replication smoke test lives in
`tools/dev/powersync-smoke/`.

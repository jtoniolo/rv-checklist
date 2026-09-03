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
| Web | Container image `ghcr.io/jtoniolo/rv-checklist-web:X.Y.Z` | `apps/web/Dockerfile`, published by `cd.yml` |
| Web chart | `oci://ghcr.io/jtoniolo/charts/rv-checklist-web` version `X.Y.Z` | `charts/web/` ([README](../charts/web/README.md)) |
| API | Container image `ghcr.io/jtoniolo/rv-checklist-api:X.Y.Z` | `apps/api/Dockerfile`, published by `cd.yml` |
| API chart | `oci://ghcr.io/jtoniolo/charts/rv-checklist-api` version `X.Y.Z` | `charts/api/` ([README](../charts/api/README.md)) |
| Database | Postgres; the app runs its TypeORM migrations at startup | `libs/api/data-access` migrations |
| PowerSync (optional) | Sync service in the API chart, gated by `powersync.enabled` | `charts/api/` PowerSync templates, ADR-0028 |
| Object storage | S3-compatible (Garage) bucket for attachments and photos | ADR-0007, ADR-0026 |
| Google credentials | OAuth client (id + secret) and a Maps Platform API key | `.env.example` documents each |

## Release contract

A git tag `vX.Y.Z` produces four artifacts at the same version: the web image,
the web chart, the API image, and the API chart. A chart `X.Y.Z` always deploys
image `X.Y.Z`, so the two cannot disagree. The deploying repository pins a
release tag and consumes the published image and chart for each tier
(ADR-0031).

## Web

The web tier runs in k3s, the same as the API. It leaves the Cloudflare Worker
and OpenNext (ADR-0031). The build makes one container image with the Next.js
standalone output: a build stage on the current Node LTS, then a distroless
runtime stage, the same shape as the API image. `apps/web/Dockerfile` is the
source, and `cd.yml` publishes the image and the chart from a release tag.

The proxy runs inside that container on the Node runtime. It protects the
signed-in routes and refreshes a near-expiry token. It is no longer at the edge
(ADR-0018, amended by ADR-0031).

`charts/web/` is the deployment contract for the tier ([README](../charts/web/README.md)).
The Deployment listens on container port 3000, and the ClusterIP Service resolves
`targetPort: http` through it, so the Service is reachable inside the cluster on
port 3000. A readiness probe and a liveness probe run on `/healthz`. The web pod
holds no secret, so the chart has no `existingSecret`.

One image serves every environment (ADR-0020). The build reads no public value.
The container reads these three from its own environment at run time, and the
server hands the two public values to the browser in an inline script. The chart
declares all three under `config`, and it refuses to render when one is missing
or a localhost value:

- `PUBLIC_API_BASE_URL` — the public API origin that the browser calls (example:
  `https://api.example.com`)
- `GOOGLE_CLIENT_ID` — the Google OAuth client id, the same one the API verifies
- `API_BASE_URL` — the address of the API Service inside the cluster, which the
  server calls for SSR fetches

The PowerSync SDK's worker and wasm ship in `apps/web/public/@powersync/`, which
`apps/web` copies from its `postinstall` (they are gitignored, and they belong to
the installed SDK version — ADR-0029, decision 8). The standalone server serves
`public/`, and the browser loads the worker from `/@powersync/worker.js` at run
time. An install with `--ignore-scripts` therefore ships a worker-less image:
every page still renders and every read still reaches the API, but the local
store never opens and offline reads do not work — the browser console carries one
warning per page saying so.

The service worker is a build output too. The web build compiles `apps/web/sw/`
into `apps/web/public/sw.js` after the Next build (ADR-0028), and the standalone
server serves it from `/sw.js`; the file is gitignored, so a build that reaches
Next some other way deploys no worker, and the app then works only while online.

### Cutover

The move is a hard cutover (ADR-0031). The hostnames do not change, so the API's
`WEB_ORIGIN` and `COOKIE_DOMAIN` stay as they are. The deployer:

1. Installs the web chart, with the API Service address inside the cluster as
   `config.API_BASE_URL`, the public API origin as `config.PUBLIC_API_BASE_URL`,
   and the Google OAuth client id as `config.GOOGLE_CLIENT_ID`.
2. Adds a tunnel route from the web hostname to the web Service on port 3000.
3. Deletes the Worker, its custom domain, and the wrangler CI job.

## API

`charts/api/values.yaml` declares the full contract: non-secret env vars under
`config`, required secret keys under `secretKeys`. The chart README documents
each key and the install command. The chart creates no Secret; the deployer
points `existingSecret` at one its platform materialises.

Two test suites hold that contract. `env-chart-contract.spec.ts` fails CI when
the API requires an env var the chart does not declare, or when `.env.example`
does not document one the schema knows about. `chart-guards.spec.ts` renders the
chart with `helm template` and proves it refuses to render when `existingSecret`,
`WEB_ORIGIN`, `COOKIE_DOMAIN`, `GOOGLE_CLIENT_ID`, `MCP_ISSUER_URL`, `S3_ENDPOINT`
or `S3_BUCKET` is missing — or when `WEB_ORIGIN`, or `POWERSYNC_URL` under
`powersync.enabled`, is left pointing at localhost. So this document and the
chart cannot silently drift from the code. Any change that adds a
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

# rv-checklist-api

Helm chart for the RV Checklist API service.

## Install

The chart resolves its own image from its `appVersion`, so a plain install needs
no value overrides beyond your own environment:

```sh
helm upgrade --install rv-checklist-api \
  oci://ghcr.io/jtoniolo/charts/rv-checklist-api --version X.Y.Z \
  --set config.GOOGLE_CLIENT_ID=<your-google-oauth-client-id> \
  --set config.MCP_ISSUER_URL=<public-origin-of-the-api> \
  --set config.WEB_ORIGIN=<public-origin-of-the-web-app> \
  --set config.COOKIE_DOMAIN=<common-parent-domain> \
  --set config.S3_ENDPOINT=<garage-s3-endpoint> \
  --set config.S3_BUCKET=<attachment-bucket> \
  --set existingSecret=rv-checklist-api
```

Every one of those is required: the chart refuses to render without it, rather
than deploying a pod that crash-loops or, worse, runs with a wrong value. The
api test `apps/api/src/app/config/chart-guards.spec.ts` renders the chart to
prove each guard still fires.

Chart version `X.Y.Z` always deploys image `ghcr.io/jtoniolo/rv-checklist-api:X.Y.Z`.
The two can never disagree, and both trace back to the git tag `vX.Y.Z`.

## Required secret

The chart does not create a Secret. Point `existingSecret` at one the cluster
materialises (e.g. via HashiCorp Vault). It must supply exactly these keys
(plus two more when `powersync.enabled` — see below):

| Key                    | What it is                                                        |
| ---------------------- | ----------------------------------------------------------------- |
| `JWT_SECRET`           | Signing key for the first-party access JWT. Long and random.       |
| `MCP_JWT_SECRET`       | Signing key for MCP OAuth JWTs (v0.2.9+). At least 32 characters. Separate from `JWT_SECRET` so rotating one does not invalidate the other's tokens. |
| `GOOGLE_CLIENT_SECRET` | Client secret of the Google OAuth client (v0.2.9+). The MCP OAuth server exchanges authorization codes with Google. From Google Cloud Console → Credentials. |
| `DATABASE_URL`         | The whole Postgres connection string, not discrete host/user/pass. |
| `GOOGLE_MAPS_API_KEY`  | Google Maps Platform API key for leg-distance fetches (ADR-0025). Scoped to Routes API + Places API (New); daily quotas capped in the free tier. |
| `S3_ACCESS_KEY_ID`     | Garage key id for the attachment bucket (ADR-0026, provisioned by ticket #110). |
| `S3_SECRET_ACCESS_KEY` | Garage secret key paired with `S3_ACCESS_KEY_ID`.                   |
| `POWERSYNC_JWT_SECRET` | Shared HS256 key for PowerSync client JWTs (ADR-0028), **base64url-encoded** (`A-Za-z0-9_-`, 43+ chars — `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`). The API signs with the decoded bytes; the sync service verifies with the same string as the `k` of an inline JWKS key. Required even with `powersync.enabled: false`. |

**Vault mapping (deploy note):** the Vault keys (the KV path is in the
operator's private deployment config, per ADR-0020) are lowercase, and one of
them is *not* a plain lowercase→uppercase rename:

| Vault key          | Secret / env var key   |
| ------------------ | ---------------------- |
| `s3_access_key_id` | `S3_ACCESS_KEY_ID`     |
| `s3_access_key`    | `S3_SECRET_ACCESS_KEY` |

The Deployment injects the Secret with `envFrom`, so extra keys reach the pod
without a chart change. The keys above are also listed in `secretKeys` in
values.yaml and rendered as explicit `secretKeyRef` env entries — a Secret
missing one of them fails pod creation with an event naming the key, instead
of an app crash-loop mid-startup. A contract test in the api
(`env-chart-contract.spec.ts`) fails CI when the app grows a required env var
the chart does not declare in `config` or `secretKeys`.

`GOOGLE_CLIENT_ID` is **not** secret — the web app ships the same id to the
browser. It lives in the ConfigMap, and rendering fails if you leave it empty.
So does `MCP_ISSUER_URL`: the API's own public origin (the API serves the
OAuth discovery routes, so this is the API's host, not the web app's), no
path component. Rendering fails if you leave it empty, because the app's own
fallback (`http://localhost:3000`) silently breaks MCP OAuth.

`S3_ENDPOINT` and `S3_BUCKET` are ConfigMap values too (ADR-0026): the Garage
S3 endpoint for attachment storage (`http://<garage-host>:3900` — Garage runs
on the home-lab host, outside the cluster) and the app's single attachment
bucket (`rv-checklist` in production). Neither is secret — the endpoint is
unreachable without the key pair in the Secret. Rendering fails if either is
left empty.

### Rotating the secret is the consumer's job

A `checksum/config` annotation rolls the pods when the ConfigMap changes, but a
chart can only hash what it renders itself — it cannot see into a Secret it did
not create. Rotating `JWT_SECRET` or `DATABASE_URL` therefore will not restart
the pods on its own. Drive that from wherever the Secret comes from: with Vault
Secrets Operator, set `rolloutRestartTargets` to this Deployment.

## PowerSync sync service (ADR-0028)

Set `powersync.enabled: true` to run the self-hosted PowerSync sync service in
the same release: a single-replica Deployment (`journeyapps/powersync-service`,
unified role), a ClusterIP Service on 8080, and a daily bucket-compact CronJob
(`powersync.compactSchedule`, default `0 2 * * *`). Sync rules ship inside the
chart (`files/sync-rules.yaml`, rendered into the PowerSync ConfigMap); a
config change rolls the pod, which is also how new sync rules take effect.

When enabled, `existingSecret` must supply two more keys:

| Key                         | What it is                                                    |
| --------------------------- | ------------------------------------------------------------- |
| `POWERSYNC_DATA_SOURCE_URI` | Postgres connection string the service replicates from: the app database, as a role with `REPLICATION` and `SELECT` on the published tables (role SQL in `docs/deployment.md`). |
| `POWERSYNC_STORAGE_URI`     | Postgres connection string for sync bucket storage: a separate database (same server is fine on Postgres 14+) owned by a dedicated role; the service creates its own schema there. |

The `powersync` publication is **not** the deployer's job — the API's TypeORM
migrations create it at startup, so it always tracks the schema. The deployer
provides `wal_level=logical`, the two roles/databases above, and a route from
`config.POWERSYNC_URL` (the public origin `GET /auth/powersync-token` hands to
clients) to the powersync Service. Client JWTs are validated against
`POWERSYNC_JWT_SECRET` with `kid` and audience pinned to `powersync` on both
sides. `powersync.sslmode` (default `verify-full`) applies to both Postgres
connections.

## Notable values

| Value               | Default | Notes                                                          |
| ------------------- | ------- | -------------------------------------------------------------- |
| `image.tag`         | `""`    | Empty means "use `appVersion`". Override only to pin a `sha-` build. |
| `image.pullPolicy`  | `IfNotPresent` | Safe — published tags are immutable.                    |
| `existingSecret`    | `""`    | **Required** — rendering fails without it. See above.           |
| `config.WEB_ORIGIN` | `""`    | **Required** — the deployed web origin (`https://rv.example.com`). Rendering fails when empty or pointing at localhost: it is the only origin CORS lets call the API. |
| `config.COOKIE_DOMAIN` | `""` | **Required** — common parent of the web and API hosts (`.rv.example.com`), so both receive the httpOnly auth cookies (ADR-0019); setting it also marks them `Secure`. |
| `config.POWERSYNC_URL` | `http://localhost:8080` | Rendering fails on a localhost value when `powersync.enabled` — browsers get this URL from `GET /auth/powersync-token`. |
| `config.REFRESH_REUSE_INTERVAL_SECONDS` | `"120"` | Reuse interval for a rotated-out refresh token (ADR-0028): a replay inside this window still refreshes, so a rotation response lost on an unreliable network self-heals. |

There is no `config.PORT`. `containerPort` is a fixed `3000` and the Service
resolves `targetPort: http` through it, so a configurable listen port could only
point the Service at a dead port — and a per-pod port means nothing in
Kubernetes, where every pod has its own IP.

## Releasing

Bump `version` and `appVersion` in `Chart.yaml` in one commit, tag it `vX.Y.Z`,
then run the CD workflow against that tag (Actions → CD → Run workflow → Tags).
CD refuses to run off a branch, and refuses to publish when the tag and
`Chart.yaml` disagree.

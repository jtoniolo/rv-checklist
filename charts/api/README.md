# rv-checklist-api

Helm chart for the RV Checklist API service.

## Install

The chart resolves its own image from its `appVersion`, so a plain install needs
no value overrides beyond your own environment:

```sh
helm upgrade --install rv-checklist-api \
  oci://ghcr.io/jtoniolo/charts/rv-checklist-api --version X.Y.Z \
  --set config.GOOGLE_CLIENT_ID=<your-google-oauth-client-id> \
  --set existingSecret=rv-checklist-api
```

Chart version `X.Y.Z` always deploys image `ghcr.io/jtoniolo/rv-checklist-api:X.Y.Z`.
The two can never disagree, and both trace back to the git tag `vX.Y.Z`.

## Required secret

The chart does not create a Secret. Point `existingSecret` at one the cluster
materialises (e.g. via HashiCorp Vault). It must supply exactly these keys:

| Key            | What it is                                                        |
| -------------- | ----------------------------------------------------------------- |
| `JWT_SECRET`   | Signing key for the first-party access JWT. Long and random.       |
| `DATABASE_URL` | The whole Postgres connection string, not discrete host/user/pass. |

Nothing else is secret. In particular `GOOGLE_CLIENT_ID` is **not** — the API
only verifies Google One Tap ID tokens against it as an audience and never runs
an authorization-code exchange, so no client secret exists anywhere in the
system, and the web app ships the same id to the browser. It lives in the
ConfigMap, and rendering fails if you leave it empty.

### Rotating the secret is the consumer's job

A `checksum/config` annotation rolls the pods when the ConfigMap changes, but a
chart can only hash what it renders itself — it cannot see into a Secret it did
not create. Rotating `JWT_SECRET` or `DATABASE_URL` therefore will not restart
the pods on its own. Drive that from wherever the Secret comes from: with Vault
Secrets Operator, set `rolloutRestartTargets` to this Deployment.

## Notable values

| Value               | Default | Notes                                                          |
| ------------------- | ------- | -------------------------------------------------------------- |
| `image.tag`         | `""`    | Empty means "use `appVersion`". Override only to pin a `sha-` build. |
| `image.pullPolicy`  | `IfNotPresent` | Safe — published tags are immutable.                    |
| `existingSecret`    | `""`    | See above.                                                      |

There is no `config.PORT`. `containerPort` is a fixed `3000` and the Service
resolves `targetPort: http` through it, so a configurable listen port could only
point the Service at a dead port — and a per-pod port means nothing in
Kubernetes, where every pod has its own IP.

## Releasing

Bump `version` and `appVersion` in `Chart.yaml` in one commit, tag it `vX.Y.Z`,
then run the CD workflow against that tag (Actions → CD → Run workflow → Tags).
CD refuses to run off a branch, and refuses to publish when the tag and
`Chart.yaml` disagree.

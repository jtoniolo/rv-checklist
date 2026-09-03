# rv-checklist-web

Helm chart for the RV Checklist web tier.

The web app deploys to k3s, the same as the API. This chart is the deployment
contract for the web tier. It has the same shape and publication as the API
chart, and it is separate from the API chart. Thus the deployer can roll one
tier without the other.

## Install

The chart resolves its own image from its `appVersion`, so a plain install needs
no value overrides beyond your own environment:

```sh
helm upgrade --install rv-checklist-web \
  oci://ghcr.io/jtoniolo/charts/rv-checklist-web --version X.Y.Z \
  --set config.PUBLIC_API_BASE_URL=<public-origin-of-the-api> \
  --set config.GOOGLE_CLIENT_ID=<your-google-oauth-client-id> \
  --set config.API_BASE_URL=<cluster-address-of-the-api-service>
```

Every one of those is required: the chart refuses to render without it, rather
than deploying a pod that runs with a wrong value. The web test
`apps/web/src/chart-guards.spec.tsx` renders the chart to prove each guard still
fires.

Chart version `X.Y.Z` always deploys image
`ghcr.io/jtoniolo/rv-checklist-web:X.Y.Z`. The two can never disagree, and both
trace back to the git tag `vX.Y.Z`.

## Config values

The web pod holds no secret. There is no `existingSecret` and no `secretKeys`.
The three values below are the whole contract. Use the names exactly, because
the runtime-config ticket and the proxy ticket read the same names.

| Value                       | What it is                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `config.PUBLIC_API_BASE_URL` | **Required.** The public API origin that the browser calls (`https://api.example.com`). Rendering fails when empty or a localhost value: the browser cannot reach a cluster-internal address. |
| `config.GOOGLE_CLIENT_ID`    | **Required.** The Google OAuth client id. Not a secret — the browser receives the same id. It must match the API's `GOOGLE_CLIENT_ID`. Rendering fails when empty. |
| `config.API_BASE_URL`        | **Required.** The address of the API Service inside the cluster (`http://rv-checklist-api:3000`). The server calls the API through it. Rendering fails when empty or a localhost value: a localhost value points the server at itself. |

## Notable values

| Value              | Default        | Notes                                                             |
| ------------------ | -------------- | ----------------------------------------------------------------- |
| `image.tag`        | `""`           | Empty means "use `appVersion`". Override only to pin a `sha-` build. |
| `image.pullPolicy` | `IfNotPresent` | Safe — published tags are immutable.                              |
| `service.type`     | `ClusterIP`    | The web tier is reachable inside the cluster on port 3000.        |
| `service.port`     | `3000`         | The Service resolves `targetPort: http` through the fixed container port. |

There is no `config.PORT`. `containerPort` is a fixed `3000` and the Service
resolves `targetPort: http` through it, so a configurable listen port could only
point the Service at a dead port — and a per-pod port means nothing in
Kubernetes, where every pod has its own IP.

## Health

The Deployment sets a readiness probe and a liveness probe on `/healthz`, both
on the container port. The container must answer that path.

## Releasing

Bump `version` and `appVersion` in `Chart.yaml` in one commit, tag it `vX.Y.Z`,
then run the CD workflow against that tag (Actions → CD → Run workflow → Tags).
CD refuses to run off a branch, and refuses to publish when the tag and
`Chart.yaml` disagree.

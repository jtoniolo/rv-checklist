# 31. The web tier moves to k3s as a container

Date: 2026-09-03

## Status

Accepted

Supersedes the web-tier host of
[ADR-0001](0001-deployment-and-connectivity.md): the web tier leaves the
Cloudflare Worker and runs as a container in k3s.

Supersedes the web build target of
[ADR-0020](0020-public-repo-deployment-split.md): the web tier builds one
environment-blind container image, not a Worker built with OpenNext and uploaded
with wrangler. The public and private split of that ADR stays.

Amends [ADR-0009](0009-nx-workspace-layout.md), the web build target, and
[ADR-0018](0018-true-hybrid-ssr-web-architecture.md), the edge middleware note.

This ADR does not amend [ADR-0028](0028-offline-first-pwa-powersync.md). The new
offline map writes new ADRs.

## Context

The web tier ran on a Cloudflare Worker through OpenNext
(`@opennextjs/cloudflare`), as [ADR-0001](0001-deployment-and-connectivity.md)
decided. Three faults make that host wrong now.

- Next 16 renames the middleware file to `proxy.ts`. OpenNext does not support
  `proxy.ts`. The `middleware.ts` convention that OpenNext supports is
  deprecated.
- The web app needs the proxy convention for the signed-in routes. OpenNext does
  not support that convention.
- Host-specific faults on the Worker stopped the offline work. The Wayfinder map
  (issue [#124](https://github.com/jtoniolo/rv-checklist/issues/124)) records
  those faults in its Cancelled section.

The API already runs in k3s behind a Cloudflare Tunnel
([ADR-0001](0001-deployment-and-connectivity.md)). The web tier can run the same
way, and then both tiers deploy with one method.

## Decision

- **Standalone output.** The web app builds with the Next.js standalone output.
  The build makes a self-contained Node server. It does not make a Worker
  bundle.
- **The proxy on Node.** `proxy.ts` runs on the Node runtime inside that server.
  It protects the signed-in routes and refreshes a near-expiry token, the work
  that the edge middleware did before
  ([ADR-0018](0018-true-hybrid-ssr-web-architecture.md)). The proxy is no longer
  at the edge.
- **Runtime public config.** The two public values reach the browser at run
  time, not at build time
  ([ADR-0020](0020-public-repo-deployment-split.md)). The server reads them from
  its own environment on each request and hands them to the browser in one
  inline script.
- **One environment-blind image.** One published image serves every
  environment. The build reads no public value. Thus a new environment needs no
  rebuild.
- **Distroless runtime stage.** The image has a build stage on the current Node
  LTS and a distroless runtime stage. This is the same shape as the API image
  ([ADR-0009](0009-nx-workspace-layout.md)).
- **A separate web chart.** The web tier has its own Helm chart, separate from
  the API chart. Thus the deployer can roll one tier without the other. The
  chart has three config values: `PUBLIC_API_BASE_URL`, `GOOGLE_CLIENT_ID`, and
  `API_BASE_URL`. The web pod holds no secret, so there is no `existingSecret`.
- **One tag for four artifacts.** A git tag `vX.Y.Z` makes four artifacts at the
  same version: the API image, the API chart, the web image, and the web chart.
  A chart of version `X.Y.Z` always deploys the image of version `X.Y.Z`, so the
  two cannot disagree.
- **A hard cutover.** The move is a hard cutover. No Worker is kept, and there is
  no fallback to the Worker.

## Alternatives that we compared

- **Keep the Worker, and pin Next to a version before `proxy.ts`.** We rejected
  this alternative. It freezes the web app on an old Next, and it does not remove
  the host-specific offline faults.
- **Keep the Worker, and drop the proxy.** We rejected this alternative. The
  signed-in routes need the proxy for the token refresh and the route guard.
- **Run the web tier on a serverless Node host, not k3s.** We rejected this
  alternative. The operator already runs k3s with a Cloudflare Tunnel for the
  API. A second host adds a second deployment model for no benefit.
- **Keep the Worker as a fallback beside the container.** We rejected this
  alternative. Two live web tiers need two builds and two configurations, and
  the Worker carries the faults that caused the move.

## Consequences

- The web tier and the API tier deploy the same way: a container in k3s behind a
  Cloudflare Tunnel. Only the API was in k3s before; now the whole application
  is.
- The proxy runs on Node. Thus the deprecated middleware convention and the
  missing `proxy.ts` support no longer block the web app.
- One image serves every environment, so the build no longer needs the
  environment at build time
  ([ADR-0020](0020-public-repo-deployment-split.md)).
- The hostnames do not change. Thus `WEB_ORIGIN` and `COOKIE_DOMAIN` stay as
  they are, and the CORS configuration of the API does not change.
- The deployer runs a cutover: it installs the web chart, adds a tunnel route to
  the web Service, and deletes the Worker, its custom domain, and the wrangler CI
  job. `docs/deployment.md` gives the steps.
- The offline work restarts on a stock Next server in k3s. The new offline map
  writes the new offline ADRs.

# Serwist Turbopack on Next 16.3 standalone output

Date: 2026-09-05. Issue: [#177](https://github.com/jtoniolo/rv-checklist/issues/177).
Map: [#174](https://github.com/jtoniolo/rv-checklist/issues/174).

## The question

How does `@serwist/turbopack` fit a Next 16.3 application with
`output: 'standalone'`, served from a container on k3s? The owner decided that
Serwist Turbopack builds the service worker. This document gives the facts that
the shell decision and the service-worker decision need.

## Method

The sources are the Serwist documentation, the Serwist source on GitHub, the
npm registry, and the Next.js documentation. Each claim has a link to the
source that owns it. Nothing was installed. The registry facts come from
`pnpm view`. The current build in this repository is in `apps/web/sw/build.mjs`,
`apps/web/next.config.js`, and `apps/web/Dockerfile`.

## 1. Supported versions and install steps

### Versions

- The current release is `@serwist/turbopack@9.5.12`, published 2026-07-22. The
  `serwist` runtime is also `9.5.12`. Source: the npm registry (`pnpm view
  @serwist/turbopack`) and the
  [release list](https://github.com/serwist/serwist/releases).
- The `preview` tag is `10.0.0-preview.14`, published 2025-09-03. It is older
  than `9.5.12`. Source: `pnpm view @serwist/turbopack time`.
- Peer dependencies of `9.5.12`: `next >=14.0.0`, `react >=18.0.0`,
  `typescript >=5.0.0` (optional), `esbuild >=0.25.0 <1.0.0` (optional),
  `esbuild-wasm >=0.25.0 <1.0.0` (optional). Node `>=18.0.0`. Source:
  [packages/turbo/package.json](https://github.com/serwist/serwist/blob/main/packages/turbo/package.json).
- The documentation says: "If you are using Next.js versions older than
  15.0.0, add the `nextConfig` option", and "Serwist 10 and newer will only
  support Next.js 15.0.0 and above." Source:
  [Turbopack docs](https://serwist.pages.dev/docs/next/turbo).
- The package tests against `next@16.2.10`. The example
  `examples/next-turbo-basic` pins `next@16.2.10`. No test covers `16.3.x`.
  Sources:
  [packages/turbo/package.json](https://github.com/serwist/serwist/blob/main/packages/turbo/package.json),
  [examples/next-turbo-basic/package.json](https://github.com/serwist/serwist/blob/main/examples/next-turbo-basic/package.json).
- This repository runs `next@16.3.3` and `serwist@^9.5.12`. Source:
  `apps/web/package.json`.
- Turbopack is the default bundler of `next build` since Next 16.0.0. The
  `--webpack` flag opts out. Turbopack does not support webpack plugins.
  Source:
  [Next.js Turbopack docs](https://nextjs.org/docs/app/api-reference/turbopack).
- `@serwist/turbopack` is a workaround for that gap. Its source says:
  "Workaround for Next.js + Turbopack, while plugins are still not supported.
  This relies on Next.js Route Handlers and file name determinism." Source:
  [packages/turbo/src/index.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/index.ts).
- The maintainer backported Turbopack support to Serwist 9 on 2025-12-20.
  Source: [issue #54](https://github.com/serwist/serwist/issues/54).

### How it works

- `withSerwist(nextConfig)` only adds `esbuild` and `esbuild-wasm` to
  `serverExternalPackages`. It changes nothing else. Source:
  [packages/turbo/src/index.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/index.ts).
  `serverExternalPackages` opts a package out of the server bundle. Source:
  [Next.js serverExternalPackages docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverExternalPackages).
- `createSerwistRoute(options)` returns a Route Handler with
  `dynamic = "force-static"`, `dynamicParams = false`, `revalidate = false`,
  `generateStaticParams`, and `GET`. `generateStaticParams` bundles the worker
  with esbuild and returns the file names. `GET` serves the bundled text from
  memory with `Content-Type: application/javascript` and
  `Service-Worker-Allowed: /`. Source:
  [packages/turbo/src/index.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/index.ts).
- The route lives at `app/serwist/[path]/route.ts`. The worker URL is
  `/serwist/sw.js`. The build also emits `/serwist/sw.js.map`, because
  `sourcemap: true` is the default. Sources:
  [Turbopack docs](https://serwist.pages.dev/docs/next/turbo),
  [packages/turbo/src/lib/build.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/lib/build.ts).
- Next prerenders a Route Handler at build time when it exports
  `generateStaticParams`. Source:
  [Next.js generateStaticParams docs](https://nextjs.org/docs/app/api-reference/functions/generate-static-params#with-route-handlers).
- `useNativeEsbuild` selects the native `esbuild` package. It defaults to
  `false`, except on Windows. Source:
  [packages/turbo/src/index.schema.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/index.schema.ts).
- The esbuild build uses `format: "esm"`, `bundle: true`,
  `platform: "browser"`, `treeShaking: true`, `minify` when `NODE_ENV` is not
  `development`, and a target from Browserslist. Source:
  [packages/turbo/src/lib/build.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/lib/build.ts).
- In development (`NODE_ENV === "development"`) the precache manifest is
  disabled and `additionalPrecacheEntries` is emptied. Sources:
  [packages/turbo/src/index.schema.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/index.schema.ts),
  [packages/turbo/src/lib/validate.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/lib/validate.ts).
- The Next config is loaded with a dynamic import of
  `next/dist/server/config.js` marked `webpackIgnore`. Source:
  [packages/turbo/src/lib/utils.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/lib/utils.ts).

### Install steps from the documentation

The documentation gives these steps. Source:
[Turbopack docs](https://serwist.pages.dev/docs/next/turbo).

1. Install: `npm i -D @serwist/turbopack esbuild serwist`.
2. Wrap the Next config: `export default withSerwist({ ... })`.
3. Create `app/serwist/[path]/route.ts` and export the result of
   `createSerwistRoute({ swSrc: "app/sw.ts", useNativeEsbuild: true, ... })`.
4. Create `app/sw.ts` with `new Serwist({ precacheEntries: self.__SW_MANIFEST,
   ... }).addEventListeners()`.
5. Add `<SerwistProvider swUrl="/serwist/sw.js">` to the root layout, or
   register the worker yourself.

## 2. The precache manifest and the route chunks

### How the manifest is built

- `@serwist/build`'s `getFileManifestEntries` globs files, hashes them, and
  applies transforms. Source:
  [get-file-manifest-entries.ts](https://github.com/serwist/serwist/blob/main/packages/build/src/lib/get-file-manifest-entries.ts).
- The default glob patterns are
  `${distDir}static/**/*.{js,css,html,ico,apng,png,avif,jpg,jpeg,jfif,pjpeg,pjp,gif,svg,webp,json,webmanifest}`
  and `public/**/*`. The glob directory is `cwd`, which defaults to
  `process.cwd()`. Sources:
  [utils.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/lib/utils.ts),
  [index.schema.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/index.schema.ts).
- A transform rewrites `.next/` URLs to `${assetPrefix}/_next/` and `public/`
  URLs to `${basePath}/`. `swSrc` is added to `globIgnores`. Source:
  [validate.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/lib/validate.ts).
- `dontCacheBustURLsMatching` defaults to `^.next/static/`, so hashed chunks
  get no revision. Source:
  [index.schema.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/index.schema.ts).
- `maximumFileSizeToCacheInBytes` defaults to `2097152` (2 MiB). Larger files
  are not precached. `globIgnores` defaults to `["**/node_modules/**/*"]`.
  Sources:
  [maximumFileSizeToCacheInBytes docs](https://serwist.pages.dev/docs/build/configuring/maximum-file-size-to-cache-in-bytes),
  [globIgnores docs](https://serwist.pages.dev/docs/build/configuring/glob-ignores),
  [schema/base.ts](https://github.com/serwist/serwist/blob/main/packages/build/src/schema/base.ts).
- The manifest is injected with an esbuild `define` at `injectionPoint`. The
  default injection point is `self.__SW_MANIFEST`. Sources:
  [build.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/lib/build.ts),
  [schema/inject-manifest.ts](https://github.com/serwist/serwist/blob/main/packages/build/src/schema/inject-manifest.ts).
- `additionalPrecacheEntries` adds entries to the manifest. The example adds
  the offline page with a revision from `git rev-parse HEAD`. Sources:
  [additionalPrecacheEntries docs](https://serwist.pages.dev/docs/build/configuring/additional-precache-entries),
  [example route.ts](https://github.com/serwist/serwist/blob/main/examples/next-turbo-basic/app/serwist/%5Bpath%5D/route.ts).

### Can the manifest hold every route chunk of the signed-in shell?

- Yes for the JavaScript and CSS. The default glob covers every file under
  `.next/static/`. Turbopack writes every client chunk of every route there. A
  route that the device never opened has its chunks in the precache. Source:
  [utils.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/lib/utils.ts).
- No for the documents. The globs do not touch `.next/server/`. The manifest
  holds no HTML and no RSC payload. The maintainer confirms this: configurator
  mode with `precachePrerendered: false` matches "default `@serwist/turbopack`
  behavior". Source:
  [issue #360, maintainer comment](https://github.com/serwist/serwist/issues/360).
- So a never-opened route renders offline only if the worker serves one
  document for every signed-in navigation. That is the client-rendered shell of
  [#159](https://github.com/jtoniolo/rv-checklist/issues/159). The shell
  document must be an `additionalPrecacheEntries` entry with a revision, and a
  navigation route or `fallbacks` entry must serve it. Sources:
  [example route.ts](https://github.com/serwist/serwist/blob/main/examples/next-turbo-basic/app/serwist/%5Bpath%5D/route.ts),
  [Serwist class docs](https://serwist.pages.dev/docs/serwist/core/serwist).
- Font files are not in the default `.next/static` pattern. The pattern has no
  `woff` or `woff2`. This repository uses no `next/font` today. Source:
  [utils.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/lib/utils.ts).
- `public/**/*` precaches every public file. A file over 2 MiB is dropped with
  a warning. The PowerSync wasm files in `public/@powersync/` are several
  megabytes, per the comment in `apps/web/sw/build.mjs`. The map bins
  PowerSync, so this matters only until then.

## 3. Serving the worker from the standalone server

### Where the worker lives

- With `@serwist/turbopack` the worker is not a file in `public/`. It is the
  prerendered response of the Route Handler at `/serwist/sw.js`. Source:
  [packages/turbo/src/index.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/index.ts).
- A user reports that `/serwist/sw.js` is in `.next/prerender-manifest.json`
  with `initialRevalidateSeconds: false`, and that after a deploy the route
  serves the prerendered bytes with no function run. Source:
  [issue #360, comment by 2nspired](https://github.com/serwist/serwist/issues/360).
- The standalone output copies the server and the traced `node_modules` into
  `.next/standalone`. It does not copy `public/` or `.next/static/`. The
  Dockerfile already copies both. Source:
  [Next.js output docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
  `apps/web/Dockerfile`.
- The current `build-sw` Nx target and `apps/web/sw/build.mjs` become
  redundant. `next build` produces the worker. The gate test
  `apps/web/src/service-worker-contract.spec.tsx` asserts the old wiring and
  must change with it.

### The `Cache-Control` header

- `apps/web/next.config.js` sets `Cache-Control: public, max-age=0,
  must-revalidate` on `source: '/sw.js'`. That path stops matching. The rule
  must move to the new path, for example `source: '/serwist/:path*'`.
- Next checks `headers()` rules "before the filesystem which includes pages
  and `/public` files". Source:
  [Next.js headers docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers).
- A `headers()` rule wins over the default for a prerendered route. The server
  says: "If cache control is already set on the response we don't override it
  to allow users to customize it via next.config". Source:
  [send-payload.ts](https://github.com/vercel/next.js/blob/canary/packages/next/src/server/send-payload.ts).
- Without that rule, a prerendered route with `revalidate = false` gets
  `s-maxage=31536000`. Source:
  [cache-control.ts](https://github.com/vercel/next.js/blob/canary/packages/next/src/server/lib/cache-control.ts).
  A shared cache in front of the container, such as the Cloudflare Tunnel edge,
  could then hold the worker for one year. The header rule is therefore
  mandatory, not optional.
- A `public/` file gets `Cache-Control: public, max-age=0` by default. Source:
  [Next.js public folder docs](https://nextjs.org/docs/app/api-reference/file-conventions/public-folder).
  That is the behaviour the current `/sw.js` rule builds on. The Route Handler
  does not get it.
- `GET` sets `Service-Worker-Allowed: /`. The worker at `/serwist/sw.js` needs
  this header to control scope `/`. The prerendered response must keep it.
  Source:
  [packages/turbo/src/index.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/index.ts).
- `apps/web/src/proxy.ts` lists `/sw.js` in `PUBLIC_PREFIXES`. The new path
  needs the same entry, or a signed-out update check gets a redirect to
  `/welcome`.
- The registrar passes the API base URL as `/sw.js?api=<url>`. A query string
  does not change a `force-static` route, so `/serwist/sw.js?api=<url>` still
  serves the same bytes, and `self.location.href` still carries the query.
  Source:
  [Next.js caching guide, `dynamic`](https://nextjs.org/docs/app/guides/caching-without-cache-components#dynamic).

## 4. Importing the existing `apps/web/sw/` modules

- The worker entry is bundled by esbuild with `bundle: true`. Any relative
  import and any package import resolve as in the current `sw/build.mjs`. The
  current build also uses esbuild with `bundle: true`. Sources:
  [build.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/lib/build.ts),
  `apps/web/sw/build.mjs`.
- `swSrc` can be any path, for example `sw/index.ts`. It resolves against
  `cwd`. Source:
  [index.schema.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/index.schema.ts).
- `esbuildOptions` passes through `define`, `tsconfig`, `alias`, `external`,
  `plugins`, `target`, `format`, `minify`, `sourcemap`, and more. Source:
  [constants.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/lib/constants.ts).
- The entry imports `@rv-checklist/domain`, `./attachment-cache.js`,
  `./message-handler.js`, `./outbox-flush.js`, and `./outbox-store.js`. All
  are plain TypeScript modules. Nothing in them depends on the old build. The
  only build-specific symbol is `self.__SW_MANIFEST`, which is the default
  injection point. Source: `apps/web/sw/index.ts`,
  [schema/inject-manifest.ts](https://github.com/serwist/serwist/blob/main/packages/build/src/schema/inject-manifest.ts).
- Differences from the current build:
  - Output format is `esm`, not `iife`. `SerwistProvider` registers the worker
    with `type: "module"` by default. The current registrar registers a
    classic worker. Sources:
    [build.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/lib/build.ts),
    [index.react.tsx](https://github.com/serwist/serwist/blob/main/packages/turbo/src/index.react.tsx),
    `apps/web/src/app/sw-register.tsx`.
  - The turbo build does not define `process.env.NODE_ENV`. The published
    `serwist` and `@serwist/turbopack/worker` files reference it. esbuild
    defines it itself for `platform: "browser"`: `"production"` when all
    minify options are on, `"development"` otherwise. Sources:
    [build.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/lib/build.ts),
    [esbuild platform docs](https://esbuild.github.io/api/#platform).
  - A source map is emitted and served at `/serwist/sw.js.map`. Source:
    [build.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/lib/build.ts).
  - The target comes from Browserslist, not `es2022`. Source:
    [build.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/lib/build.ts).
- The current `typecheck` target runs `tsc -p sw/tsconfig.json`. Turbopack does
  no type checking. That target stays. Source:
  [Next.js Turbopack docs](https://nextjs.org/docs/app/api-reference/turbopack),
  `apps/web/package.json`.

## 5. Background Sync and cross-origin fetch with cookies

- The bundled worker is plain JavaScript. A `self.addEventListener("sync",
  ...)` handler works as it does today. The build tool does not touch it.
  Source: `apps/web/sw/index.ts`,
  [build.ts](https://github.com/serwist/serwist/blob/main/packages/turbo/src/lib/build.ts).
- The page registers the tag today:
  `libs/web/data-access/src/lib/outbox/outbox.ts` calls
  `sync.register(ATTACHMENT_OUTBOX_SYNC_TAG)`. That does not change.
- Serwist's own `BackgroundSyncQueue` registers
  `self.registration.sync.register("serwist-background-sync:<name>")` when
  `"sync" in self.registration`. Otherwise it replays at worker start-up. It
  replays with `fetch(entry.request.clone())`. Source:
  [BackgroundSyncQueue.ts](https://github.com/serwist/serwist/blob/main/packages/core/src/lib/backgroundSync/BackgroundSyncQueue.ts).
- `StorableRequest` stores `method`, `referrer`, `referrerPolicy`, `mode`,
  `credentials`, `cache`, `redirect`, `integrity`, `keepalive`, the headers,
  and the body. A request captured with `credentials: "include"` replays with
  `credentials: "include"`. Source:
  [StorableRequest.ts](https://github.com/serwist/serwist/blob/main/packages/core/src/lib/backgroundSync/StorableRequest.ts).
- `BackgroundSyncPlugin` adds failed requests to that queue from a strategy.
  Source:
  [BackgroundSyncPlugin docs](https://serwist.pages.dev/docs/serwist/runtime-caching/plugins/background-sync-plugin).
- So the worker can register a tag and run a cross-origin fetch with cookie
  credentials. The API must allow credentials in CORS, as it does today
  ([ADR-0019](../adr/0019-cookie-token-transport.md)). The Turbopack
  integration adds no constraint here.
- `SerwistProvider` reloads the page on the `online` event by default
  (`reloadOnOnline = true`). An open docs issue reports that this reload fires
  before a background sync completes. Sources:
  [index.react.tsx](https://github.com/serwist/serwist/blob/main/packages/turbo/src/index.react.tsx),
  [issue #231](https://github.com/serwist/serwist/issues/231).

## 6. Update policy: skip waiting and clients claim

- `Serwist` constructor options. `skipWaiting` "Forces the waiting service
  worker to become the active one." `clientsClaim` "Claims any currently
  available clients once the service worker becomes active." Both default to
  `false`. Source:
  [Serwist class docs](https://serwist.pages.dev/docs/serwist/core/serwist),
  [Serwist.ts](https://github.com/serwist/serwist/blob/main/packages/core/src/Serwist.ts).
- With `skipWaiting: true` the constructor calls `self.skipWaiting()` at once.
  With `skipWaiting: false` the worker listens for a `SKIP_WAITING` message and
  calls `self.skipWaiting()` then. Source:
  [Serwist.ts](https://github.com/serwist/serwist/blob/main/packages/core/src/Serwist.ts).
- `@serwist/window` emits a `waiting` event when a new worker is installed but
  not active. `messageSkipWaiting()` sends the `SKIP_WAITING` message. Source:
  [@serwist/window docs](https://serwist.pages.dev/docs/window).
- The worker handles a `CACHE_URLS` message. `SerwistProvider` sends it on
  every `pushState` and `replaceState` when `cacheOnNavigation` is `true`,
  which is the default. Sources:
  [Serwist.ts](https://github.com/serwist/serwist/blob/main/packages/core/src/Serwist.ts),
  [index.react.tsx](https://github.com/serwist/serwist/blob/main/packages/turbo/src/index.react.tsx).
- The current worker uses `skipWaiting: true` and `clientsClaim: true`. The same
  two options exist here. The two policies are:
  - Immediate: `skipWaiting: true`, `clientsClaim: true`. A deploy takes effect
    on the next load. Open tabs switch worker at once.
  - Prompted: `skipWaiting: false`. The page listens for `waiting`, asks the
    user, and calls `messageSkipWaiting()`.

## 7. Known defects in the current release

Open on 2026-09-05:

- [#360](https://github.com/serwist/serwist/issues/360). `createSerwistRoute`
  runs at request time after an on-demand revalidation. The import of
  `next/dist/server/config.js` is marked `webpackIgnore`, so output file
  tracing does not include it, and the handler throws
  `ERR_MODULE_NOT_FOUND`. A user traced the trigger to
  `revalidatePath("/", "layout")`. The maintainer says the route "was always
  meant to be a build script of some sort". The maintainer also says that with
  `cacheComponents` enabled, Next 16 ignores `dynamic`, `dynamicParams`, and
  `revalidate`, so the route becomes dynamic. The Next docs confirm that these
  options are removed when Cache Components is enabled. The maintainer's
  proposed alternative is configurator mode. Blocked by
  [vercel/next.js#76612](https://github.com/vercel/next.js/issues/76612).
  Sources: the issue,
  [Next.js route segment config](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config).
  This repository does not enable `cacheComponents` and does not call
  `revalidatePath` or `revalidateTag`.
- [#366](https://github.com/serwist/serwist/issues/366). With `assetPrefix`
  set to a CDN, the manifest holds `public/` entries that fail to precache.
  This repository sets no `assetPrefix`.
- [#363](https://github.com/serwist/serwist/issues/363). `@serwist/window`
  `register()` throws when `navigator.serviceWorker.register()` resolves
  without a registration. Fix in
  [PR #364](https://github.com/serwist/serwist/pull/364), not merged.
- [#231](https://github.com/serwist/serwist/issues/231). `reloadOnOnline`
  reloads before background sync completes. Docs issue.

Fixed in the 9.5.x line:

- 9.5.11: `SerwistProvider` had no `"use client"` directive
  ([#357](https://github.com/serwist/serwist/issues/357)).
- 9.5.9: JSX was not transpiled in the dist
  ([#353](https://github.com/serwist/serwist/issues/353)).
- 9.5.7: CJS/ESM interop of `next/dist/server/config.js` under Bun;
  `rebuildOnChange` added.
- 9.5.6: `public/` files precached from the wrong folder
  ([#339](https://github.com/serwist/serwist/issues/339)); empty `basePath`.
- 9.5.5: the Next config is loaded automatically; `nextConfig` deprecated.
- 9.5.4: Turbopack no longer resolves `esbuild` or `esbuild-wasm` at bundle
  time ([#335](https://github.com/serwist/serwist/issues/335)).
- 9.5.2: `useNativeEsbuild` added.

Source:
[packages/turbo/CHANGELOG.md](https://github.com/serwist/serwist/blob/main/packages/turbo/CHANGELOG.md).

### Configurator mode as the fallback

`@serwist/next/config` exports a `serwist()` function. It "only generates the
`@serwist/cli` configuration needed to build the service worker. The service
worker is then built after Next.js has prerendered everything". It "does not
depend on webpack internals, so it works with Turbopack as well". It has a
`precachePrerendered` option. Source:
[Configurator mode docs](https://serwist.pages.dev/docs/next/config). This is
an external build step after `next build`, the same shape as the current
`build-sw` target. The owner decided on `@serwist/turbopack`. Configurator mode
is the documented alternative if #360 blocks the build.

## Install steps for this repository

1. Add `@serwist/turbopack@^9.5.12` to `apps/web` `devDependencies`. Keep
   `serwist@^9.5.12` and `esbuild@^0.28.2`, which are already there.
2. In `apps/web/next.config.js`, wrap the config with `withSerwist` from
   `@serwist/turbopack`. Keep `output: 'standalone'` and
   `outputFileTracingRoot`.
3. Change the `headers()` rule from `source: '/sw.js'` to
   `source: '/serwist/:path*'`. Keep the value
   `public, max-age=0, must-revalidate`.
4. Add `/serwist/` to `PUBLIC_PREFIXES` in `apps/web/src/proxy.ts`.
5. Create `apps/web/src/app/serwist/[path]/route.ts`. Export the result of
   `createSerwistRoute({ swSrc: 'sw/index.ts', useNativeEsbuild: true,
   additionalPrecacheEntries: [...] })`. Put the shell document and the offline
   page in `additionalPrecacheEntries` with a revision. Set
   `esbuildOptions.tsconfig` to `sw/tsconfig.json` if the entry needs it.
6. Keep `apps/web/sw/index.ts` as `swSrc`. Keep its imports. Remove the
   `sw/build.mjs` manifest scrape of `public/` and `/_next/static/`, because
   the default globs cover both.
7. Change `apps/web/src/app/sw-register.tsx` to register `/serwist/sw.js`
   (with the `?api=` query) with `type: 'module'`, or replace it with
   `SerwistProvider` with `reloadOnOnline: false`.
8. Delete the `build-sw` Nx target and `sw/build.mjs`. Change `start` and
   `serve-static` to depend on `build`. Change `apps/web/Dockerfile` to run
   `nx run @rv-checklist/web:build`. Keep the `typecheck` target for `sw/`.
9. Update `apps/web/src/service-worker-contract.spec.tsx` to assert the new
   wiring: the route file exists, the header rule matches `/serwist/:path*`,
   and the Dockerfile runs the build.
10. Build the image. Check that `/serwist/sw.js` answers 200 from the
    standalone server with `Cache-Control: public, max-age=0, must-revalidate`
    and `Service-Worker-Allowed: /`, and that the manifest count in the build
    log is greater than zero.

## Open risks

1. `@serwist/turbopack` is tested on `next@16.2.10`. No test covers
   `16.3.x`. A spike must run the build on `16.3.3`.
2. The worker is a prerendered Route Handler. If anything reruns the route at
   request time in the container, it fails: the image has no `esbuild`
   binary in the trace, no `sw/index.ts`, and no `.next/static` at `cwd`.
   Issue #360 is open. The repository must never call
   `revalidatePath("/", "layout")` or enable `cacheComponents`.
3. Without a `headers()` rule for `/serwist/:path*`, the route answers with
   `s-maxage=31536000`. A shared cache at the tunnel edge could hold an old
   worker for a year.
4. The manifest holds every chunk under `.next/static/`. The first install
   after each deploy downloads every route's JavaScript. The size is unknown
   until the spike measures it.
5. The manifest holds no document. A never-opened route renders offline only
   if the shell decision gives the worker one document to serve for every
   signed-in navigation.
6. The worker is an ES module. The current registrar registers a classic
   worker for older Android Chrome. The devices are all Android; the spike must
   confirm module worker support on them.
7. `cwd` defaults to `process.cwd()`. Under Nx the build must run from
   `apps/web`, or the globs find nothing. The build log prints the precache
   count; zero means the globs missed.
8. `SerwistProvider` defaults `reloadOnOnline` to `true` and
   `cacheOnNavigation` to `true`. Both change page behaviour. Set both
   explicitly, or keep the custom registrar.
9. Files over 2 MiB are dropped from the precache with a warning. The
   PowerSync wasm files exceed that until PowerSync is binned.
10. Serwist 10 has no stable release. The preview is older than 9.5.12. Serwist
    10 drops Next below 15.0.0 and removes `nextConfig`. No date is published.

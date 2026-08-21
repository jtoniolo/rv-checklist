# PowerSync Web SDK — Operational Fit

**Question (issue #136):** Does the PowerSync web SDK satisfy the charter ("background sync, no manual sync action") on an installed Android Chrome PWA? Four sub-questions: closed-app flush via one-shot Background Sync, client storage, Serwist coexistence, and self-host shape.

**Date compiled:** 2026-08-21

**Sources:** Primary only — docs.powersync.com, powersync-ja GitHub source/issues, MDN, web.dev/Chrome, Serwist docs, OpenNext docs, mdn/browser-compat-data. Each claim cites its source.

---

## Summary

| Sub-question | Answer |
|---|---|
| Closed-app flush of PowerSync upload queue from a `sync` event | **No.** The SDK does not run in a service worker; its worker architecture cannot even be constructed there, and the maintainers confirm web background sync is unsupported. |
| Hybrid that preserves "no manual sync ever" | Yes: PowerSync auto-flushes its queue on next app open with zero user action; optionally add a SW-side idempotent mirror outbox replayed to the NestJS API by one-shot Background Sync. |
| Client storage | wa-sqlite over IndexedDB (default) or OPFS; no COOP/COEP needed; multi-tab via shared worker is off by default on Android; `navigator.storage.persist()` is silently auto-granted to installed PWAs and blocks eviction. |
| Serwist coexistence | No structural conflict. PowerSync uses shared/dedicated workers (not a SW); its worker assets are static files in `public/` served by Workers Static Assets. One caveat: keep Serwist runtime caching away from `/@powersync/*`. |
| Self-host | `journeyapps/powersync-service` container + `powersync.yaml`; bucket storage in MongoDB **or Postgres (>= service 1.3.8)**; source Postgres needs `wal_level=logical`, a replication role, and a `powersync` publication. Minimal footprint 512 MB / 1 vCPU. Licence FSL-1.1-ALv2: internal self-hosting permitted. |

**Bottom line:** Closed-app flush of the PowerSync upload queue is **impossible today** — but the charter does not need it. The SDK flushes automatically on every app open/reconnect with no user action, which is "no manual sync ever". To also get #127's closed-app reconnect upload, add the small SW mirror outbox on top; it complements, not replaces, PowerSync.

---

## 1. Closed-app flush

### The SDK does not run in a service worker

- The web SDK's documented architecture is page + workers: "Multiple tab support relies on shared web workers for database and sync operations… the SDK creates a shared web worker named `shared-powersync-[dbFileName]`"; with multi-tab disabled "each tab spawns a standard web worker for database operations." Service workers are not part of the architecture at all. — [PowerSync JS Web SDK reference](https://docs.powersync.com/client-sdks/reference/javascript-web)
- Maintainer position, on the exact question ("the powersync code needs to run in a service worker context"): "A potential blocker for adoption on our side is that a majority of the features you shared are still an experimental/draft stage and they are also currently Chrome/Chromium only. I'll follow up internally about making the lack of this support for web (at least for now) more clear in our documentation." — [powersync-ja/powersync-js#825](https://github.com/powersync-ja/powersync-js/issues/825) (open, no implementation)
- The SDK's background-syncing guide covers Flutter, React Native and Kotlin/Android only; web is absent. — [Background syncing](https://docs.powersync.com/client-sdks/advanced/background-syncing)

### Why it cannot work in `ServiceWorkerGlobalScope` (platform, not just policy)

- The `Worker()` constructor is "available in Web Workers, **except for Service Workers**" — a service worker cannot spawn the SDK's dedicated DB worker. — [MDN: Worker()](https://developer.mozilla.org/en-US/docs/Web/API/Worker/Worker)
- `SharedWorker` is constructible only from window contexts ("their constructor is not exposed" in worker scopes) — the shared sync worker cannot be created from a SW either. — [MDN: SharedWorker](https://developer.mozilla.org/en-US/docs/Web/API/SharedWorker)
- OPFS sync access handles, which the OPFS VFS variants depend on, are "only available in Dedicated Web Workers". — [MDN: createSyncAccessHandle()](https://developer.mozilla.org/en-US/docs/Web/API/FileSystemFileHandle/createSyncAccessHandle)
- The SDK does expose `useWebWorker: false` ("not recommended, but can be useful… for environments or toolchains where web workers are not supported"), so an IndexedDB-VFS client without workers is *constructible* in theory — but running a second writer against the same local DB from a SW is untested and unsupported (per #825), and a Chrome `sync` event is capped at ~3 minutes of execution (see #127 findings). Do not adopt. — [options.ts source](https://github.com/powersync-ja/powersync-js/blob/main/packages/web/src/db/adapters/options.ts), [docs/research/2026-08-20-android-chrome-pwa-background-sync.md](2026-08-20-android-chrome-pwa-background-sync.md)

**Conclusion: flushing the PowerSync upload queue from a Background-Sync-woken service worker is not possible.** Same for Periodic Background Sync: a `periodicsync` handler cannot run the PowerSync download path either — it can only make plain HTTP requests (e.g. warm caches or ping the API).

### The hybrid that preserves "no manual sync ever"

"No manual sync" means no user action — it does not require closed-app upload. Two layers:

1. **Baseline (sufficient for the charter): automatic flush on app open/reconnect.** Local writes "are placed into an upload queue by the PowerSync Client SDK and automatically uploaded to your app backend" while connected; `uploadData` "will be automatically invoked by the PowerSync Client SDK whenever it needs to upload client-side writes", and "any thrown errors will result in a retry after the configured wait period (default: 5 seconds)". The user never triggers sync; opening the app (or regaining connectivity while it is open) is enough. — [JS Web SDK reference](https://docs.powersync.com/client-sdks/reference/javascript-web), [PowerSyncBackendConnector.ts](https://github.com/powersync-ja/powersync-js/blob/main/packages/common/src/client/connection/PowerSyncBackendConnector.ts)
2. **Optional upgrade (restores #127's closed-app reconnect upload): SW mirror outbox.** On each local write, the page also appends the operation (with a client-generated idempotency key) to an IndexedDB outbox and registers a one-shot Background Sync tag. The SW, woken on reconnect with the app closed, replays the outbox directly against the NestJS API (writes already replay through the API per #129); the server deduplicates by idempotency key, because the same operation will arrive a second time via the PowerSync upload queue on next app open. The local SQLite DB reconciles through the normal PowerSync download stream. IndexedDB is readable from the SW; one-shot Background Sync reliably wakes the SW on reconnect (WICG "SHOULD fire" + Chromium JobScheduler). — [MDN: Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API), [#127 findings](2026-08-20-android-chrome-pwa-background-sync.md)
3. **Periodic Background Sync pre-warm** (>= 12 h, engagement-gated, best-effort) can only issue HTTP requests, not populate the SQLite DB. Low value; skip unless a cheap "server reachable / token fresh" ping is wanted. — [#127 findings](2026-08-20-android-chrome-pwa-background-sync.md)

Adopt layer 1 now; treat layer 2 as a follow-up ticket if closed-app upload latency matters (it only shortens the window between reconnect and the server seeing an offline edit).

---

## 2. Client storage

**Engine and VFS options.** The SDK runs wa-sqlite (WebAssembly SQLite) with selectable VFS: `IDBBatchAtomicVFS` (IndexedDB, the default, broadest compatibility), `OPFSCoopSyncVFS` (OPFS, multi-tab, recommended for Safari), `AccessHandlePoolVFS` (OPFS, single-tab), `OPFSWriteAheadVFS` (OPFS + WAL, concurrent reads, "only supported on Chromium-based browsers"), plus in-memory options for dev. — [JS Web SDK reference](https://docs.powersync.com/client-sdks/reference/javascript-web)

**Headers.** No COOP/COEP/cross-origin isolation is required for any standard configuration; only the experimental `InMemoryWriteAheadLogPool` (SharedArrayBuffer) needs it: "Without cross-origin isolation and shared array buffers, constructing the pool will throw." — [JS Web SDK reference](https://docs.powersync.com/client-sdks/reference/javascript-web)

**Persistence and eviction (Android Chrome).** Under default "best effort" storage, browsers under storage pressure "evict data… from the least recently used origin". `navigator.storage.persist()` marks the origin persistent, after which data "is only deleted if the user chooses to remove it using their site settings". Chrome shows no prompt; it silently grants based on: site engagement level, "has the site been installed or bookmarked?", and notification permission — an installed PWA is squarely inside the auto-grant heuristics. Request `persist()` on first meaningful use. — [web.dev: Persistent storage](https://web.dev/articles/persistent-storage)

**Multi-tab.** Multi-tab uses the shared worker and is "enabled by default where available" but defaults to **false on Android, iOS, and Safari**, falling back to a "less reliable" BroadcastChannel mechanism; source docstring: "enabled by default on Desktop browsers if shared workers are enabled, except for Safari". — [JS Web SDK reference](https://docs.powersync.com/client-sdks/reference/javascript-web), [options.ts](https://github.com/powersync-ja/powersync-js/blob/main/packages/web/src/db/adapters/options.ts)
- Platform background: `SharedWorker` was historically unavailable in Chrome for Android; it shipped in **Chrome 148** (browser-compat-data `chrome_android: 148`; Chromium Intent to Ship "SharedWorker on Android"). PowerSync's defaults have not caught up, and an installed PWA is effectively single-window anyway, so this is a non-issue for us. — [mdn/browser-compat-data api/SharedWorker.json](https://github.com/mdn/browser-compat-data/blob/main/api/SharedWorker.json), [chromestatus: SharedWorker on Android](https://chromestatus.com/feature/6265472244514816), [Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/pS1PDOa69CU)

**Choice for this app:** default `IDBBatchAtomicVFS` (or `OPFSWriteAheadVFS` later for read concurrency on Chromium) + `navigator.storage.persist()` at first run. Known issue: OPFS variants misbehave in Safari incognito. — [JS Web SDK reference](https://docs.powersync.com/client-sdks/reference/javascript-web)

---

## 3. Serwist coexistence (Next.js on OpenNext/Cloudflare)

**No structural conflict.** PowerSync registers no service worker — only shared/dedicated web workers ([JS Web SDK reference](https://docs.powersync.com/client-sdks/reference/javascript-web)) — so it cannot collide with Serwist's SW registration or scope. Serwist compiles `swSrc` to a static `swDest` (e.g. `public/sw.js`) with the precache manifest injected at the `self.__SW_MANIFEST` injection point, which matches the build-time-static-SW constraint already established for OpenNext. — [Serwist Next.js getting started](https://serwist.pages.dev/docs/next/getting-started)

**Worker assets.** PowerSync's workers/wasm are pre-bundled static files: a postinstall step `powersync-web copy-assets -o public` copies them to `public/@powersync/`, referenced explicitly via `worker: '/@powersync/worker.js'`. — [PowerSync Next.js guide](https://docs.powersync.com/client-sdks/frameworks/next-js), [@powersync/web README](https://github.com/powersync-ja/powersync-js/blob/main/packages/web/README.md)

**Serving on Cloudflare.** OpenNext serves `public/` through Workers Static Assets; with the default `run_worker_first=false`, "requests are intercepted before reaching the worker and are not billed", and headers are configured via Workers Static Assets settings (with `run_worker_first=true` they come from the Next config instead). The `/@powersync/` files are ordinary static assets — nothing special needed. — [OpenNext Cloudflare: static assets](https://opennext.js.org/cloudflare/howtos/assets)

**Build config (webpack path, `next build --webpack`).** PowerSync's Next.js guide requires `config.experiments = { asyncWebAssembly: true, topLevelAwait: true }` and a `.wasm` `asset/resource` rule client-side; PowerSync client code must sit behind `'use client'` (the SDK "requires browser APIs which are not available in Node.js" and no-ops in SSR), which is fine under OpenNext since PowerSync never runs in the Worker runtime. — [PowerSync Next.js guide](https://docs.powersync.com/client-sdks/frameworks/next-js)

**Two real caveats:**
1. *Stale worker scripts.* Worker-script fetches from a controlled page pass through the SW. Serwist's `defaultCache` runtime caching could serve a stale, unhashed `/@powersync/*.js`/`.wasm` after an SDK upgrade. Exclude `/@powersync/` from runtime caching and precache (Serwist exposes `exclude` configuration), or version the asset path on upgrade. — [Serwist Next.js docs](https://serwist.pages.dev/docs/next/getting-started)
2. *No COOP/COEP needed* for standard PowerSync configs (section 2), so Serwist/OpenNext header handling needs no cross-origin-isolation changes — do not add COEP, as it would constrain every cross-origin subresource.

---

## 4. Self-host shape (homelab Helm)

**Container and config.** The service ships as `journeyapps/powersync-service` on Docker Hub. Config is a YAML/JSON file (`powersync.yaml`) supplied via mounted volume, Base64 env var, or CLI parameter; sections: replication connections, storage, port (API default `port: 80`), sync rules/streams, `client_auth` (JWKS URI or static keys; asymmetric keys — RS256/EdDSA/ECDSA — recommended for production), logging. `!env` substitution works for variables prefixed `PS_`. — [Self-hosting intro](https://docs.powersync.com/intro/self-hosting), [Self-hosted instance configuration](https://docs.powersync.com/configuration/powersync-service/self-hosted-instances)

**Bucket storage.** Two supported backends: **MongoDB** (single-node replica set acceptable for dev; 3-node recommended for production) and **Postgres, available since service version 1.3.8** (dedicated user + schema; for Postgres < 14 the bucket store must be a separate server from the source DB, >= 14 may share a server though separate is recommended). MySQL is not a bucket-storage option. For the homelab, Postgres bucket storage on the existing Postgres >= 14 avoids running MongoDB at all. — [Self-hosted instance configuration](https://docs.powersync.com/configuration/powersync-service/self-hosted-instances)

**Source Postgres requirements.** "PowerSync requires Postgres version 11 or greater." Needs: `wal_level = logical` (`ALTER SYSTEM SET wal_level = logical;` + restart); a replication role (`CREATE ROLE powersync_role WITH REPLICATION BYPASSRLS LOGIN PASSWORD '…'` + `SELECT` grants); and a publication named `powersync` (`CREATE PUBLICATION powersync FOR ALL TABLES;` — prefer listing only synced tables, since "the PowerSync Service has to read all updates present in the publication"). Logical replication implies a replication slot per deployment plus a replication connection from the service. — [Source database setup](https://docs.powersync.com/configuration/source-db/setup.md)

**Footprint.** Minimal (dev/staging, matches a homelab): PowerSync container "512MB memory, 1 vCPU"; MongoDB "2GB memory, 1 vCPU" (or the Postgres bucket-storage alternative above). Production guidance: 1 GB/1 vCPU per replication container (only one replication process may run at a time — i.e. one replication replica) and per API container, target <= 100 concurrent client connections per API container (hard cap 200), plus a daily compact job. A single-replica Helm Deployment with ~0.5–1 GB requests is realistic for this app's user count. — [Deployment architecture](https://docs.powersync.com/maintenance-ops/self-hosting/deployment-architecture.md)

**Licence.** `powersync-service` is licensed **FSL-1.1-ALv2** (Functional Source License 1.1, Apache-2.0 future licence). Permitted purposes include "your internal use and access"; the restriction is on Competing Use ("making the Software available to others in a commercial product or service that… substitutes for the Software"). Each release additionally becomes Apache-2.0 "on the second anniversary of the date we make the Software available". Self-hosting the sync service for this app is internal use → permitted. — [powersync-service LICENSE](https://github.com/powersync-ja/powersync-service/blob/main/LICENSE)

---

## Verdict

- **Closed-app flush of the PowerSync upload queue: not possible.** The web SDK does not run in a service worker (maintainer-confirmed, powersync-js#825) and the platform blocks its worker architecture there (`Worker()`/`SharedWorker` not constructible from a SW; OPFS sync handles dedicated-worker-only).
- **The charter still holds without it.** PowerSync uploads its queue automatically whenever the app is open and connected — no manual sync action ever. Adopt that as the baseline, and (optionally, follow-up ticket) add the SW-side idempotent mirror outbox + one-shot Background Sync replay through the NestJS API to regain #127's closed-app reconnect upload. This reopens #129's write-path mechanics only to the extent of adding idempotency keys server-side; the engine choice stands.
- Storage (IndexedDB/OPFS + `persist()` auto-granted to installed PWAs), Serwist coexistence (static assets, no COOP/COEP, one cache-exclusion rule), and self-hosting (one small container, Postgres bucket storage, FSL-1.1-ALv2 internal use) all check out.

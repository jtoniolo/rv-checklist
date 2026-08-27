# 28. Offline-first PWA — PowerSync local store, operation-queue writes, service-worker shell

Date: 2026-08-22

## Status

Accepted

Amends [ADR-0018](0018-true-hybrid-ssr-web-architecture.md) (offline rendering path),
[ADR-0012](0012-google-one-tap-passport-refresh-tokens.md) (refresh-token reuse interval),
and [ADR-0011](0011-redux-rtk-state.md) (what feeds the RTK Query cache).
Extends [ADR-0026](0026-stop-attachments-shared-garage-bucket.md) (attachments offline).
Amended by [#159](https://github.com/jtoniolo/rv-checklist/issues/159): the
**cached-pages model and current-trip route warming are superseded**. A detail
route can carry a client-generated id created off grid, so neither a per-URL
document nor a per-URL RSC payload can ever exist for it, and no route set or
warming scope closes that. Signed-in routes become a single client-rendered
shell instead; one document answers every signed-in URL. The attachment caches,
the IndexedDB outbox, Background Sync and the whole PowerSync read and write
path below are **unaffected** — as is current-trip *attachment* warming. The
replacement ADR is owed by [#164](https://github.com/jtoniolo/rv-checklist/issues/164).
Amended by [ADR-0029](0029-powersync-read-path-into-rtk-query.md): the read-path
section below gives the shape; ADR-0029 fixes the contract — `upsertQueryEntries`
as the one way in, no emission before the first sync completes, and precedence
local store > network response > SSR seed.
Amended by [ADR-0030](0030-run-step-operations-merged-server-side.md): the
run-steps and client-authored-Log-Entry bullets below give the shape; ADR-0030
fixes the contract — merge by step id with a per-step stamp inside the jsonb,
a compare-and-set outside the record clock, and the checks that keep a
client-supplied `logEntryId` from being a forgery surface.

Charted on Wayfinder map [#124](https://github.com/jtoniolo/rv-checklist/issues/124);
the closed tickets under it are the trail of how each part was decided.

## Context

The app is used off grid: campgrounds without signal, days without connectivity.
The owner set the charter before charting began: **everything writable online is
writable offline** (reads too); the existing PWA is enhanced — no React Native;
devices are 100% Android; sync is **background from the start** with no manual
sync action; a same-record collision resolves as **newest edit wins** with no
merge UI; the rig's Distance is a running total, so sync must apply additions,
never snapshot-overwrite it; SSR (ADR-0018) stays for online use; degraded
offline is accepted for network-by-nature functions (place autocomplete,
automatic leg distances, attachment upload); the current trip's attachments —
at minimum the campground map — cache to the device ahead of time.

One directive shaped every choice: **no small-app framing.** No decision is
justified by "one user / tiny data". Prefer off-the-shelf over hand-rolled.
This app is the testbed for Aquarify (same NestJS/TypeORM/Postgres +
Next.js/RTK stack, multi-user, NATS event-driven); decisions here must
transfer.

## Decision

### Sync engine: PowerSync

- **PowerSync** provides the local store (SQLite via wa-sqlite in the browser,
  IndexedDB-backed) and replication: a **self-hosted sync service container**
  streams Postgres changes (`wal_level=logical`, a `powersync` publication) into
  per-client SQLite. Bucket storage runs on the existing Postgres (service
  ≥ 1.3.8) — no MongoDB. SDKs are Apache-2.0; the service's FSL-1.1 permits
  self-hosting our own product.
- **Write authority stays in the NestJS API.** PowerSync downloads data; it
  never writes Postgres directly. Every client write is an operation in the
  engine's upload queue, replayed through our existing semantic endpoints — so
  server-side invariants, the Distance delta arithmetic, and (in Aquarify)
  NATS domain events all keep their single home.

### Read path: local-first everywhere

- The UI reads the local store online and offline; the engine keeps it synced.
  Reactive local reads structurally eliminate the stale-until-refresh class.
- ADR-0011 stands: RTK Query remains the one client cache, now fed by engine
  watch-query subscriptions streaming into it (`onCacheEntryAdded`). SSR serves
  first paint per ADR-0018; the client then attaches to the live store. The
  cache-seeder clobber guard (#134) keeps a stale SSR seed from overwriting
  newer local data.
- **Sync rules: per-rig buckets** plus one per-user bucket for the user's own
  row. **Full history, no windowing** — due status needs the newest log entry
  per task, and past trips are the product's memory. Synced tables: users (own
  row), rigs, equipment, checklists, runs, maintenance tasks, log entries,
  trips, stops, attachment metadata. Auth/token tables are excluded; attachment
  bytes never sync. Sync-rule queries cannot join, so **`rig_id` is
  denormalized onto stops and attachments** (immutable after create).

### Write path: operation queue through the API

- Queued operations replay in order through the existing endpoints: deltas for
  Distance (arrival, leg edit, delete — the server computes each delta against
  the current stored value, so two devices' offline arrivals both land as
  additions), sets elsewhere. The stored `distance_km` column stays; no ledger.
- **Client-generated ids on all creates** (optional; absent keeps server
  minting, so the MCP surface is unchanged) and a **per-operation idempotency
  key with a server dedup table** make every replay safe — including the two
  known traps: leg-delta replay on `PATCH /stops/:id` and `POST /log-entries`
  on a one-time task (which deletes the task). A taken client id is never
  retryable: on the single-record creates it is either the caller's own replay
  (the stored row returned untouched) or **404**, indistinguishable from not
  found (ADR-0003); a *stop* id reused inside a `POST /trips` create is
  **409 Conflict**. Either way it is a 4xx, so the queue marks that operation
  failed rather than retrying a request that can never succeed.
- **Newest wins is server-enforced per-record LWW**: each write carries the
  client's edit timestamp, clamped to server time on receipt, applied only if
  newer than the stored edit time. Delta operations (arrival, reorder, the
  rig-Distance adjustment, the sibling renumber a stop delete triggers) are
  exempt from the *gate* — they always apply — but not from the *stamp*: every
  record they write takes `max(stored, clamped)` as its new edit time rather
  than server receipt time. Re-stamping those records "now" would silently drop
  the same client's next queued edit, which is by definition older than the
  replay that precedes it. A delete is never gated at all, and the stamp rule
  still governs whatever it writes as a side effect.
- **Run steps are per-step operations, merged server-side** — record-level LWW
  would erase one device's completions when phone and tablet finish different
  steps of the same run offline. Non-step run fields stay per-record LWW.
- **Offline task-linked completion authors the Log Entry client-side** (client
  id, `logEntryId` set on the step locally); replay posts the entry, then the
  run patch; the server honors a provided `logEntryId` that exists and matches
  the task. Due status is therefore correct offline.
- Campground-map toggle and attachment delete are queueable (delete treats 404
  as success). Legs re-fetch automatically on reconnect under the same guards
  as today's auto-fill (never manually set, both ends have places, not
  arrived).

### Service worker: hand-rolled on the Serwist runtime

- The SW entry uses the `serwist` runtime package, compiled by a **post-build
  esbuild script** that injects the precache manifest and writes
  `public/sw.js` (`buildCommand` in `open-next.config.ts`); Turbopack stays.
  Built in [#150](https://github.com/jtoniolo/rv-checklist/issues/150), which
  settled three things this record did not: **`public/sw.js` is a gitignored
  build output**, so development has no service worker at all (one left over
  from a build would cache-first the dev server's chunks and fight every
  edit) and the registrar clears any it finds; the manifest is wired twice, in
  `buildCommand` and in a `build-sw` Nx target, the way ADR-0029 decision 8
  wires the asset copy and for the same reason; and `/sw.js`, `/offline` and
  `/@powersync/` become **public prefixes** in the middleware, because the
  update check and the install fetch are not navigations and a redirect to
  `/welcome` can only corrupt them (see ADR-0029's amended consequence).
- **Cached-pages model, no HTML app-shell precache.** Navigations stay
  network-first — online behavior is byte-identical to today and the edge
  middleware is untouched. The SW runtime-caches each visited page's HTML and
  RSC payloads; offline, visited routes serve from cache and the hooks-only
  components (#135) re-render from the local store. Unvisited routes get a
  precached, branded, static **offline fallback page** (no data rendering).
- **Updates are immediate** (`skipWaiting` + `clientsClaim`, no reload prompt).
  `/_next/static/*` is cache-first (immutable). `/@powersync/*` worker assets
  are excluded from runtime caching but **precached with revisions derived
  from the installed SDK version** — required for offline cold boot. #150 adds
  one exception on the other side: the **fallback page's own assets** — its
  stylesheet, and the chunks its prerendered HTML loads — are precached too,
  because the fallback is the one page nobody ever opens online, so nothing it
  needs can be assumed to be in a cache filled by the owner's own visits. An
  unstyled fallback is not a branded one, and without its script the page
  cannot work out where its links point (`offline-links.tsx`). The list comes
  from the emitted `offline.html`, so it is exactly what that page asks for and
  nothing else; the rest of the build's JavaScript is left to the cache-first
  rule, which already holds the chunks the owner fetched.
- **Current-trip warming:** when a trip becomes current, the client messages
  the SW to fetch and cache that trip's routes and attachments.

### Attachments offline (extends ADR-0026)

- **Read:** bytes cache in SW Cache Storage keyed by the existing
  `/attachments/:id` URL, **cache-first** (binaries are immutable, delete-only).
  A per-trip warming cache (campground maps first, dropped whole when the trip
  stops being current) plus a 50-entry LRU for browsed files. Uncached +
  offline shows the row with the view action disabled ("available online").
- **Write:** offline captures go to an **IndexedDB outbox** (blob + stop id +
  client-generated attachment id), flushed by **one-shot Background Sync**
  replaying the normal multipart POST from the SW — the one write path that
  works with the app closed. The upload POST accepts the client id (idempotent
  replay) and `isCampgroundMap`. Pending attachments are outbox-only, badged
  "waiting to upload"; no server row exists before its bytes do. Transient
  failures retry without cap; 401 holds the outbox behind the sign-in banner;
  other 4xx mark the entry failed with retry/discard actions.

### Background sync: what closed-app sync really means

Closed-app flush of the PowerSync upload queue is **impossible** — the web SDK
cannot run in a service worker (platform limits, maintainer-confirmed). The
charter holds anyway: PowerSync flushes automatically whenever the app is open
and connected, so no manual sync action exists; the attachments outbox is the
one closed-app upload path. An optional SW mirror-outbox for domain writes
(idempotency keys make it safe) is a possible follow-up, not part of this
decision. Periodic Background Sync is best-effort ≥ 12 h; freshness comes from
sync-on-open.

### Offline auth policy

- The offline shell **trusts local data with no session check** — device lock
  is the security boundary; cookies are httpOnly and the middleware never runs
  offline (the SW serves cached pages when navigation fetches fail). No
  client-side offline session limit; the ~180-day refresh token is the only
  bound, enforced at reconnect.
- The **sync layer owns token refresh for its own calls** (background flush has
  no page in the path): on 401, `POST /auth/refresh`, retry once; on failure,
  hold the queue and show a **"sign in to sync" banner**. After One Tap
  sign-in the queue flushes — guarded by an **owner match**: a queue is never
  merged into a different account. Logout is online-only.
- **ADR-0012 is amended with a rotation reuse interval**: a replaced refresh
  token stays valid ~2 minutes after rotation, so a lost rotation response
  self-heals instead of killing the session and stalling background sync.
  Spent-token replay inside the window is tolerated instead of triggering
  family revocation.

### UI signals

An app-wide **offline indicator** in the header, driven by the sync engine's
connection state (browser online/offline events as fallback). The manual
Distance field **warns when offline** (it is an absolute LWW write racing
queued deltas; the residual few-km race is accepted and owner-correctable).

## Alternatives considered

- **Hand-rolled Dexie outbox replaying REST calls** — the initial research
  verdict (no new infra, RTK Query untouched). Rejected under the
  no-small-app-framing directive: it is bespoke sync machinery we would own
  forever, and it does not transfer to Aquarify. The comparison facts stand.
- **Replicache / RxDB** — the no-container runners-up; more glue code than
  PowerSync for this stack. **ElectricSQL** — same infra cost as PowerSync,
  less mature write story. **Zero** — replaces the query layer, conflicts with
  ADR-0011.
- **React Native client** for real background execution — rejected; the
  charter is PWA-only, and Android Chrome's Background Sync covers the one
  closed-app need (attachment upload).
- **`@serwist/next`** — forces the whole app onto `next build --webpack`;
  `@serwist/turbopack` is broken on serverless. Hence the hand-rolled SW on
  the Serwist runtime.
- **HTML app-shell precache with a client shell router** — rewires online
  navigation and fights ADR-0018's SSR; the cached-pages model keeps online
  byte-identical.
- **Derived Distance (Σ arrived legs + adjustments) or a server-side ledger** —
  machinery the feature does not need; the server already owns delta
  arithmetic and replay is already idempotent on those paths.
- **Merge/conflict UI** — rejected by charter; newest-wins, no exceptions.

## Consequences

- **Ops:** a PowerSync service container joins both deployments;
  `wal_level=logical` (restart) plus a replication role and a `powersync`
  publication on Postgres; a daily compact job. Generic config lives here,
  environment-specific deployment lives in the private repository (ADR-0020).
- **Schema:** `rig_id` denormalized onto stops and attachments; a per-record
  `editedAt` LWW column; an idempotency-key dedup table; create endpoints
  accept optional client ids.
- **The API stays the sole write authority**; PowerSync is read replication.
  MCP and any future clients are unaffected.
- Server-computed reads (due status, trip status, current trip, list
  stitching) must also run client-side against the local store — the shared
  domain lib is the home for any that still live only in API services.
- Online behavior is unchanged: SSR, middleware, and first paint are
  byte-identical; offline is a layered-on rendering path, not a rewrite.
- Degraded offline is accepted and visible: no place autocomplete, no
  automatic leg distances (fetched on reconnect), uploads queue.
- The stack transfers to Aquarify: buckets scope by aggregate root, writes
  replay through the API preserving NATS events, LWW + idempotency carry over.

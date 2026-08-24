# 29. PowerSync read path — watch queries into the RTK Query cache

Date: 2026-08-23

## Status

Accepted

Amends [ADR-0028](0028-offline-first-pwa-powersync.md) (the read-path section)
and, through it, [ADR-0011](0011-redux-rtk-state.md) (what feeds the RTK Query
cache) and [ADR-0018](0018-true-hybrid-ssr-web-architecture.md) (Pattern C).

Decided while building issue
[#146](https://github.com/jtoniolo/rv-checklist/issues/146), under the map
[#124](https://github.com/jtoniolo/rv-checklist/issues/124).

## Context

ADR-0028 chose PowerSync and said the local store feeds RTK Query through
`onCacheEntryAdded`. That is the shape, not the contract. The details decide
whether the feature works, because this is the **second** write path into a
cache that #134 and #135 had just finished making single-source: the SSR seed
(ADR-0018 Pattern C) already writes to it, and a seed that lands after a watch
emission — or an emission that lands before replication has run — puts stale or
empty data on the owner's first paint.

Four tickets build directly on whatever this ticket settles (#147 local writes,
#149 sync-layer auth, #150 the service worker, #155 the server-computed reads),
so the rules belong in an ADR rather than in code comments.

The constraint that shapes most of it: **online behaviour must stay
byte-identical**. SSR, the edge middleware, and first paint are unchanged;
offline is a layered-on rendering path.

## Decision

### 1. Direction of the feed: `upsertQueryEntries`, never `updateCachedData`

Watch results enter the cache with `api.util.upsertQueryEntries` dispatched
from inside `onCacheEntryAdded`. `updateCachedData` cannot be used: it mutates
an existing `data` value, so it is a no-op on an entry that is pending or
rejected — which is precisely the offline case this exists for.
`upsertQueryEntries` is the same mechanism the SSR seeder uses, and RTK
registers the endpoint's `providesTags` for upserted entries, so mutation
invalidation keeps reaching them.

### 2. The watch does not wait for `cacheDataLoaded`

Awaiting `cacheDataLoaded` before subscribing is the documented pattern and it
is wrong here. Offline, the entry's own fetch rejects, the await never settles,
and the watch never opens. The watch opens as soon as the entry is added and
tears down on `cacheEntryRemoved`.

### 3. Nothing is emitted before the first sync completes

This is the rule that protects first paint. A watch over an empty local store
answers `[]`, which is indistinguishable from "replication has not run yet";
emitting that over a good SSR seed shows the owner an empty list. So no
emission reaches the cache until the database reports first sync complete
(`waitForFirstSync()` / `currentStatus.hasSynced`). Before that, the SSR seed
and the network response stand.

It is a **first-run** gate, not an online gate: on a returning device
`hasSynced` is already true from persisted state, so an offline cold boot
emits immediately.

### 4. Precedence: local store > network response > SSR seed

A watch emission outranks the SSR seed, and that half is absolute:
`seed-cache.ts` is **not modified**, because its `isSuccess` guard (#134)
already makes a later Pattern C seed skip an entry a watch has filled. Needing
to edit the seeder is the signal that a change to this read path has gone
wrong.

Against the entry's **own network response** the ordering is weaker, and holds
in one direction only: an already-open watch cannot clobber a fresh response,
because emissions are change-triggered. A watch that opens inside the response's
window can, and the reverse happens too — on a returning device `hasSynced` is
already true, so the first emission often lands *before* the fetch it raced and
the fetch then overwrites it. Both orderings are accepted: the two values differ
only by replication lag, and the later one is the fresher.

### 5. This ticket writes nothing to the local SQLite

All mutations keep going through RTK Query and REST exactly as before, so the
PowerSync upload queue stays empty and is left entirely to #147. The connector
still has to supply an `uploadData`; it is a no-op that **returns** rather than
throws, because a throw is how a connector reports a failed upload and the SDK
answers it with an uncapped retry loop.

### 6. Components never import PowerSync

Hooks-only (#135) is unchanged. The only consumer of the local store is the
endpoint lifecycle in `libs/web/data-access`, and the SDK itself is reached
through a single dynamically-imported module behind a `LocalDatabase`
interface — so no component, page or layout changes, and the server render
never loads a Worker, wasm or IndexedDB.

### 7. Which endpoints get a watch

Only those whose payload is a faithful reconstruction of the ten synced tables:
`listRigs`, `listChecklists`, `listEquipment`, `listTasks`, `listLogEntries`,
`listLogEntriesByRig`, `listRuns`, `listRunsByRig`, `listRunsByTrip`, `getRun`
and `listTripsByRig`.

`listTripsByRig` needs local stitching of `trips`, `stops` and `attachments`
into nested `TripRead`s, with `status` derived from the stops and `checklistIds`
filtered against live checklists — all reproducing what the API's read model
does. **The no-join restriction applies to sync rules, not to local watch SQL**,
so this is allowed; the denormalized `rig_id` on stops and attachments (#140)
makes it three rig-scoped reads rather than a join.

Explicitly network-only and out of scope: `mapsAutocomplete`, `placeDetails`,
`routeDistance`, `mcpTokenStatus`, `listOAuthGrants`, `listWebSessions`, and
`me` (the auth path is left alone this ticket). Anything carrying a value the
API computes on read from data that does not sync belongs to #155 — leave it
network-only with a pointer rather than shipping a half-filled shape.

A single-row watch (`getRun`) that finds no row emits **nothing**. "Absent
locally" is as often "not replicated yet" as "deleted", and there is no cache
value meaning "gone", so the entry is left to the network or the seed.

### 8. Assets are copied, not bundled

`powersync-web copy-assets` writes the SDK's worker bundle and its wasm into
`apps/web/public/@powersync/`, and both the database worker and the shared sync
worker are opened by URL from there. The copied files are gitignored, so the
copy has to be wired into something every deployment runs.

It is wired in twice, deliberately:

- **`apps/web`'s `postinstall`** — the assets belong to the installed SDK
  version, so an install is the honest place to produce them, and it is the one
  step no deployment can skip. This is what covers `npx opennextjs-cloudflare
  build` (the build [docs/deployment.md](../deployment.md) documents), which
  never goes through Nx and so cannot inherit an Nx dependency.
- **An Nx target** that `dev`, `build`, `build:worker` and `preview:worker`
  depend on — this is what restores the files *without* a reinstall, after a
  clean checkout of an existing tree or a `git clean`, and it is cached on the
  installed `@powersync/web` version.

`apps/web/src/powersync-assets-contract.spec.tsx` fails the gate if either
wiring is dropped, because the symptom is invisible in this repo: the assets
are gitignored, `dev` copies them anyway, and the app falls back to the network
rather than breaking.

The alternative — letting the SDK resolve `new URL('./worker.js',
import.meta.url)` and having the bundler trace the wasm — would have to be
solved twice: Turbopack has no wasm handling configured here, and OpenNext
deploys `public/` as `.open-next/assets`. Service-worker precaching of these
assets, with revisions derived from the installed SDK version, is #150's job.

### 9. `navigator.storage.persist()` is requested on first open

Chrome grants it silently to installed or engaged origins. Off grid the local
store is the only copy of the owner's data, so eviction under storage pressure
is unrecoverable. It is requested once per page, skipped when already granted,
and failure is tolerated — the store works without it.

### 10. The local store belongs to one owner, and sign-out clears it

The local store is persisted SQLite that outlives the session that filled it,
and PowerSync keeps `hasSynced` inside it. Decision 3 then works against us on
a shared browser: a store one owner has synced answers `waitForFirstSync`
immediately, so the first watch a *second* owner opens over it emits the
previous owner's rows — and by decision 4 that emission outranks the seed and
can outlive the new owner's own correct network response. The property to hold
is one sentence: **a store belonging to one owner is never opened for, and
never connected with the token of, a different owner — including offline.**
Four rules, each holding where the one before it did not run:

- **Sign-out clears.** The logout mutation calls `disconnectAndClear()` then
  `close()` and drops the memoised store, so a later sign-in opens a fresh one
  and connects with the new owner's token. `resetApiState()` alone is not
  enough: it tears the watches down and leaves the rows.
- **A store belonging to a different owner is never adopted.** The store file
  is owner-scoped (`rv-checklist-<owner>.sqlite`), and the owner is resolved
  *before* the store is handed to any watch — a window between opening and
  knowing whose it is is a window in which watches emit the wrong owner's rows.
  A store left behind by someone who closed the tab without signing out is only
  ever opened again by that same owner.
- **Every session change forgets the remembered owner**, a sign-in as much as a
  sign-out. The remembered owner exists for one purpose — the offline fallback
  below — and a sign-in that leaves the previous owner remembered turns a single
  failed token request into that owner's store being opened for the new one.
  Forgetting costs nothing a fresh sign-in cannot pay: signing in is online by
  construction, so the incoming owner is resolved from the server anyway.
- **The connector refuses a token that is not its store's owner's.** It is
  built for one owner and returns `null` (the SDK's "no credentials") for any
  other `sub`. Who is signed in is memoised per page and the cookies can change
  under it — a sign-in in a second tab — and replication writes into whichever
  file the store was opened over, so without this check owner B's rows can land
  in owner A's file and the owner-scoped filename stops describing its
  contents.

The owner comes from the sync token itself: `GET /auth/powersync-token` mints a
JWT whose `sub` is the user the sync rules scope to, so the store is keyed by
exactly the identity that filled it. The connector already reads that token
into JS — it has to hand it to the SDK — so reading its own `sub` adds no
exposure, and the httpOnly session cookies stay invisible either way
(ADR-0019). Only a transport failure (genuinely offline) falls back to the
owner remembered in `localStorage`, which rule 3 keeps meaning "the owner whose
session this browser still holds"; any answer the server did give that is not a
readable token means "no local store", because a remembered value that
disagrees with a reachable server is the stale one.

## Consequences

- **Replication latency is a visible residual, and is accepted.** A watch
  emission reflects the local store, which lags the server by replication
  latency. A mutation's own fresh response can only be transiently overwritten
  if a new watch opens inside that window — emissions are change-triggered, so
  an already-open watch cannot clobber it. The real fix is local writes in
  #147; no machinery is built for it here.
- **The local schema is hand-maintained against the API's migrations.** It is
  declared once (`powersync/tables.ts`) and drives the PowerSync schema, the
  row types, and the SELECT lists — so a column cannot be spelled one way in
  the schema and another in a query — but nothing checks it against Postgres.
  A migration that adds or renames a synced column needs the same edit here.
- **List order is matched where the API defines one and stabilised where it
  does not.** `listRigs`, `listChecklists`, `listEquipment`, `listRunsByRig`
  and `listLogEntriesByRig` issue unordered finds, so Postgres promises
  nothing; those read `created_at` ascending locally. Their screens either sort
  themselves or use the result as an unordered pool.
- **Emissions are not validated with Zod.** The network path parses every
  response; the local path does not, to keep re-reads cheap. The unit tests
  parse each projection's output against the same domain schema instead, so a
  drift shows up in the gate rather than in the browser. A failed read is
  swallowed and the watch stays open — the cache keeps whatever the network or
  the seed left.
- **`/@powersync/` is not in the middleware's public prefixes, and the
  middleware is untouched.** A signed-in worker fetch is same-origin and
  credentialed, so it falls through to `next()`. Residual: if the access cookie
  has expired at the moment the worker is opened, the middleware answers the
  worker request with a redirect to `/welcome` and the constructor fails until
  the next page load. That is the same exposure every other same-origin asset
  has, and the sync layer's own auth handling is #149.

  **Amended by [#150](https://github.com/jtoniolo/rv-checklist/issues/150):
  `/@powersync/` is now a public prefix.** The residual above was accepted
  because it cost one page load. The service worker precaches these assets
  (ADR-0028 — a cold offline start has no other way to get them), and a
  redirect there is answered during `install`, where it either lands in the
  precache as the SDK's worker or fails the install outright. Making them
  public removes the case: they are the SDK's own bytes, identical for every
  user and carrying no data of theirs, so a session gates nothing.
- **A host without `Worker`, `indexedDB` and `WebAssembly` has no local
  store** and silently falls back to the network path. That covers the server
  render and jsdom under test as well as a locked-down browser.
- **A failed open is a missing local store, not a failed watch.** Opening can
  reject for reasons outside this path — the worker fetch answered with the
  redirect above, a CSP that blocks wasm, OPFS unavailable — and RTK Query
  rethrows whatever `onCacheEntryAdded` rejects with, so an unguarded open is
  one unhandled rejection per watched entry for the life of the page. The watch
  treats it as "no local store" and the network answers. The failure is not
  memoised either, so a later subscription retries rather than inheriting a
  dead store. It is swallowed but not silenced: the first failure on a page is
  reported to the console, because the same catch covers an expired cookie that
  fixes itself and a deployment that shipped without `/@powersync/` and never
  will, and a silent fallback makes the second indistinguishable from a working
  app.
- **A sign-in whose first token request fails has no local store until the page
  reloads.** Forgetting the remembered owner (decision 10, rule 3) means the
  offline fallback has nothing to fall back to for the rest of that page, and
  the resolved "nobody" is memoised per page like any other answer. The trade is
  deliberate: the alternative is a stale remembered owner, and one bad request
  is a reload, while a stale owner is another person's data on the screen.
- **Signing out does not reach a store this page never opened.** Clearing needs
  an open handle, so an owner who reloads onto a page with no watched endpoint
  and signs out there leaves their rows on disk. Owner-scoped filenames mean
  nobody else can read them; they are data at rest until that owner signs in
  again, or the browser evicts them. The same holds for the store of an owner
  who closed the tab without signing out.
- **Acceptance is split between the gate and the hand.** The pure pieces — the
  projections, the trip stitching, and the watch-to-cache reducer — are unit
  tested against a fake local database. The two live criteria (a server-side
  change appearing without a refresh; previously synced data rendering with the
  network cut) have no harness in this repo: there is no Playwright or Cypress,
  and the Jest environments have no IndexedDB, Worker, wasm or
  `navigator.storage`. They are manual against `tools/dev/docker-compose.yml`.

## Alternatives considered

- **Gate the watch on `cacheDataLoaded`** — the documented RTK Query pattern.
  Rejected: it never settles when the entry's fetch rejects, which is the
  offline case.
- **`updateCachedData` per emission** — rejected; it cannot populate a pending
  or rejected entry, and it would need a second mechanism for exactly the case
  that matters.
- **Emit as soon as the watch opens, and let the seeder win ties** — rejected;
  it inverts the precedence and would need `seed-cache.ts` to grow a
  local-vs-seed rule, which is the outcome #134 was built to avoid.
- **One SQL statement per endpoint, with `json_group_array` for the trip
  stitching** — rejected; it moves the assembly into SQLite-version-dependent
  aggregate ordering and out of reach of a plain unit test, for no gain at this
  data size.
- **Bundler-resolved worker and wasm** — rejected; see decision 8.
- **A `<PowerSyncProvider>` in the root layout** — rejected; it adds a
  component that imports the SDK, and it starts replication for signed-out
  visitors. Opening lazily from the first subscribed watch keeps `layout.tsx`
  and the SSR path byte-identical.

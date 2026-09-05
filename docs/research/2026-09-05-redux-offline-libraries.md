# Offline write queue and persistence for a Redux Toolkit store

**Date:** 2026-09-05

**Issue:** [#175](https://github.com/jtoniolo/rv-checklist/issues/175), part of
[#174](https://github.com/jtoniolo/rv-checklist/issues/174).

## The question

Which library, or which combination of libraries, gives a Redux Toolkit store
a persisted write queue and a persisted state, for a PWA that is offline for
180 days?

The owner named redux-offline and asked for a better option if one exists.

## The constraints

These constraints come from #174 and #175:

- The API keeps write authority.
- One persisted Redux Toolkit store holds all user data in slices. Components
  select from the store.
- Each write operation needs an idempotency key. The device replays the
  operations in order.
- The device can be offline for 180 days. The queue and the state must survive
  the gap, a storage eviction, and a version upgrade of the persisted shape.
- The service worker must flush the queue when the application is closed.
  Serwist builds the service worker.
- Newest edit wins. Rig Distance is a running total, so the queue carries a
  delta for it, not a new value.
- All devices are Android.
- Prefer off-the-shelf over hand-rolled.
- PowerSync is binned, unless a ticket shows a significant technical advantage.

## The method

Each fact below comes from a primary source: the npm registry, the GitHub
repository, the source code, or the official documentation of the library. The
npm and GitHub data are from 2026-09-05.

## Platform facts that apply to every candidate

These facts limit every candidate. The browser sets them, not the library.

- **Storage eviction.** Chromium evicts the data of an origin only under
  storage pressure, and it evicts the least recently used origin first. It
  evicts all the data of the origin at one time. It does not evict an origin
  that has persistent storage. An origin gets persistent storage from
  `navigator.storage.persist()`. Chromium grants this with no prompt, from
  heuristics such as installation of the PWA, a bookmark, or high engagement.
  Source: [MDN, Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
  and [web.dev, Persistent storage](https://web.dev/articles/persistent-storage).
- **No time limit on unused data in Chromium.** The Chromium rule is storage
  pressure, not age. Safari deletes script-created data after 7 days of no
  interaction. Safari is not a target. Source:
  [MDN, Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
- **localStorage is too small and is not available in a worker.** Web
  Storage has a limit of 10 MiB on all browsers, 5 MiB for `localStorage`.
  IndexedDB in Chromium can use up to 60% of the disk. Source:
  [MDN, Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
  IndexedDB is in the list of Web APIs available to workers. Web Storage is not
  in that list. Source:
  [MDN, Functions and classes available to Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Functions_and_classes_available_to_workers).
  Thus a queue that the service worker reads must be in IndexedDB.
- **Background Sync.** A page registers a tag with
  `registration.sync.register()`. The service worker gets a `sync` event when
  the device has a connection. Source:
  [MDN, Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API).
  The event can fire when the page is not open. Retries use exponential
  back-off. Source:
  [Chrome Developers, Introducing Background Sync](https://developer.chrome.com/blog/background-sync).
  Chromium makes a maximum of 3 attempts. The first retry delay is 5 minutes.
  Each retry delay is 3 times the previous one. One sync event can run for a
  maximum of 3 minutes. Source:
  [Chromium source, `background_sync_parameters.cc`](https://github.com/chromium/chromium/blob/main/content/public/browser/background_sync_parameters.cc).
  `SyncEvent.lastChance` is `true` on the final attempt. Source:
  [MDN, SyncEvent.lastChance](https://developer.mozilla.org/en-US/docs/Web/API/SyncEvent/lastChance).
  Chrome and Chrome for Android support it. Firefox and Safari do not. Source:
  [caniuse, Background Sync API](https://caniuse.com/background-sync).
- **Periodic Background Sync** needs an installed PWA and runs on the
  engagement score of the site. Source:
  [MDN, Web Periodic Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API).

Conclusion from the platform facts: after 3 failed sync events, the browser
stops. The page must register the tag again on the next open. The queue itself
must have no age limit, because the browser keeps the data until storage
pressure or a user action.

## Candidate 1: redux-offline

Package: `@redux-offline/redux-offline`.

### Facts

- **Latest release:** 2.6.0, published 2020-05-21. Source:
  [npm registry](https://registry.npmjs.org/@redux-offline/redux-offline).
- **Deprecated on npm.** The latest version carries the notice "Package no
  longer supported. Contact Support at https://www.npmjs.com/support for more
  info." The registry record changed on 2026-04-01. Source:
  [npm registry](https://registry.npmjs.org/@redux-offline/redux-offline).
- **Repository archived.** The GitHub API reports `archived: true`. The last
  push was 2025-02-26. The README says "Maintainers wanted". Source:
  [GitHub API, redux-offline/redux-offline](https://api.github.com/repos/redux-offline/redux-offline)
  and [README](https://github.com/redux-offline/redux-offline).
- **Redux Toolkit compatibility.** The peer dependency is `redux >=3`. The
  package depends on `redux-persist ^4.6.0`. Source:
  [package.json on `develop`](https://github.com/redux-offline/redux-offline/blob/develop/package.json).
  The default `persist` is `persistStore` from redux-persist v4, and the default
  `persistAutoRehydrate` is `autoRehydrate` from redux-persist v4. Source:
  [`src/defaults/persist.js`](https://github.com/redux-offline/redux-offline/blob/develop/src/defaults/persist.js)
  and [`src/defaults/persistAutoRehydrate.js`](https://github.com/redux-offline/redux-offline/blob/develop/src/defaults/persistAutoRehydrate.js).
  The documentation says "Redux Offline uses Redux Persist v4 by default. It
  is not recommended to write your own implementation for this feature."
  Source: [config docs](https://github.com/redux-offline/redux-offline/blob/develop/docs/docs/api/config.md).
  Redux Toolkit 2.12.0 has peer dependencies on React 16.9 to 19 and
  react-redux 7.2 to 9. Source:
  [npm registry](https://registry.npmjs.org/@reduxjs/toolkit). No primary source
  records a test of redux-offline against Redux 5 or Redux Toolkit 2.
- **The outbox model.** An action carries `meta.offline.effect`,
  `meta.offline.commit`, and `meta.offline.rollback`. Source:
  [introduction](https://redux-offline.github.io/redux-offline/docs/introduction).
  The reducer stamps each action with `meta.transaction`, an integer that
  increments per device, and appends the action to `outbox`. Source:
  [`src/updater.js`](https://github.com/redux-offline/redux-offline/blob/develop/src/updater.js).
  The default queue is first in, first out: `enqueue` appends, `peek` returns
  the head, `dequeue` removes the head. Source:
  [`src/defaults/queue.js`](https://github.com/redux-offline/redux-offline/blob/develop/src/defaults/queue.js).
  The default retry schedule has 10 steps from 1 second to 1 hour. After the
  last step the action is discarded. Source:
  [`src/defaults/retry.js`](https://github.com/redux-offline/redux-offline/blob/develop/src/defaults/retry.js)
  and [config docs](https://github.com/redux-offline/redux-offline/blob/develop/docs/docs/api/config.md).
  The default `discard` drops an action on any non-network error and on HTTP
  4xx. Source:
  [`src/defaults/discard.js`](https://github.com/redux-offline/redux-offline/blob/develop/src/defaults/discard.js).

### Answers to the questions of the issue

- **API as write authority:** Yes. The effect is a network request. The commit
  and rollback actions carry the response of the API.
- **Idempotency key and ordered replay:** Partial. `meta.transaction` is a
  per-device counter, not a globally unique key. The replay is in order.
- **180-day gap, eviction, version upgrade:** The outbox lives in the persisted
  `offline` slice, so it survives a gap. There is no age limit on the outbox.
  The persistence is redux-persist v4, which has no `createMigrate`. A version
  upgrade of the persisted shape needs custom code.
- **Service worker flush:** No. The queue runs inside the Redux middleware in
  the page. The library has no service worker support.
- **Maintenance:** Deprecated on npm, archived on GitHub, last release 2020.

## Candidate 2: Redux Toolkit alone

This candidate uses `createListenerMiddleware` plus a queue slice, with a
persistence library.

### Facts about Redux Toolkit

- **Latest release:** 2.12.0, published 2026-05-15. Source:
  [npm registry](https://registry.npmjs.org/@reduxjs/toolkit).
- **`createListenerMiddleware`** was added in Redux Toolkit 1.8.0 on
  2022-02-27. Source:
  [release v1.8.0](https://github.com/reduxjs/redux-toolkit/releases/tag/v1.8.0).
  It is "a lightweight alternative to more widely used Redux async middleware
  like sagas and observables". A listener effect gets `dispatch`, `getState`,
  `condition`, `take`, `delay`, `pause`, `fork`, `cancelActiveListeners`, and an
  AbortSignal `signal`. The listeners are in memory. Source:
  [createListenerMiddleware](https://redux-toolkit.js.org/api/createListenerMiddleware).
- **RTK Query persistence.** The RTK Query documentation says "persisting API
  slices is not recommended". It provides `extractRehydrationInfo` for
  rehydration and documents the `REHYDRATE` action of redux-persist. Source:
  [Persistence and Rehydration](https://redux-toolkit.js.org/rtk-query/usage/persistence-and-rehydration).
  RTK Query has no offline mutation queue.
- **The Redux Toolkit usage guide documents redux-persist.** It gives the
  `serializableCheck.ignoredActions` list `[FLUSH, REHYDRATE, PAUSE, PERSIST,
  PURGE, REGISTER]`. It names no other persistence library. Source:
  [Usage guide, Use with Redux-Persist](https://redux-toolkit.js.org/usage/usage-guide).

### Facts about redux-persist

- **Latest release:** 6.0.0, published 2019-09-02. Peer dependency
  `redux >4.0.0`. Source: [npm registry](https://registry.npmjs.org/redux-persist).
- **Repository.** Not archived. Last push 2024-05-01. Last commit on `master`
  2021-11-22. 593 open issues and pull requests. Source:
  [GitHub API, rt2zz/redux-persist](https://api.github.com/repos/rt2zz/redux-persist).
- **Storage engines.** The default web engine is `localStorage`. A custom
  engine needs `setItem`, `getItem`, and `removeItem` that return promises.
  Source: [README](https://github.com/rt2zz/redux-persist).
- **Migrations.** `createMigrate` runs versioned migration functions from the
  stored version to the current version. The `migrate` option can be any
  function that returns a promise of the new state. Source:
  [docs/migrations.md](https://github.com/rt2zz/redux-persist/blob/master/docs/migrations.md).
- **Serialization.** The state goes through `JSON.stringify()`. Source:
  [README](https://github.com/rt2zz/redux-persist).
- **IndexedDB engines for redux-persist.** `localforage` 1.10.0, published
  2021-08-18. Source: [npm registry](https://registry.npmjs.org/localforage).
  `redux-persist-indexeddb-storage` 1.0.4, published 2019-12-11. Source:
  [npm registry](https://registry.npmjs.org/redux-persist-indexeddb-storage).
  `idb-keyval` 6.3.0, published 2026-07-08, gives `get`, `set`, and `del` over
  IndexedDB. Source: [npm registry](https://registry.npmjs.org/idb-keyval). A
  three-line wrapper maps it to the redux-persist engine interface.

### Facts about redux-remember, a newer persistence library

- **Latest release:** 6.0.2, published 2026-02-10. Source:
  [npm registry](https://registry.npmjs.org/redux-remember).
- **Repository.** Not archived. Last push 2026-02-10. 4 open issues. 131
  stars. MIT. Source:
  [GitHub API, zewish/redux-remember](https://api.github.com/repos/zewish/redux-remember).
- **Redux Toolkit support.** The README says "Fully tested with Redux 5.0+ and
  Redux Toolkit 2.0+". It supports `localStorage`, `sessionStorage`,
  AsyncStorage, "or your own custom driver". The companion `redux-remigrate`
  gives versioned migrations. Source:
  [README](https://github.com/zewish/redux-remember).
- **Driver interface.** A driver has `getItem(key)` and `setItem(key, value)`.
  The return type is `any`, so a driver can return a promise. Source:
  [`src/types.ts`](https://github.com/zewish/redux-remember/blob/master/packages/redux-remember/src/types.ts).
- **Risk.** One maintainer and a small community.

### Answers to the questions of the issue

- **API as write authority:** Yes. The queue slice holds operations. The
  listener sends each operation to the API. The API response is the
  confirmation. Nothing in this candidate applies a write without the API.
- **Idempotency key and ordered replay:** Yes, by design of the slice. The
  slice gives each operation a UUID and a sequence number. The listener sends
  the head of the queue and waits for the response before it sends the next
  one. No library provides this. The slice and the listener are project code.
- **180-day gap, eviction, version upgrade:** The queue is a slice, so it
  persists with the store. The age limit is the choice of the project. A
  storage eviction deletes the whole origin, and no library survives that. The
  persisted shape upgrades with `createMigrate` (redux-persist) or
  `redux-remigrate` (redux-remember).
- **Service worker flush:** Partial. The listener runs in the page. For a
  closed-app flush, the service worker reads the same IndexedDB record in a
  `sync` event handler and sends the operations. Both sides need one shared
  module for the send logic and one shared record format. The store must
  persist to IndexedDB, because the service worker cannot read `localStorage`.
  Serwist gives the `sync` event plumbing. Refer to the Serwist facts below.
- **Maintenance:** Redux Toolkit is active. redux-persist has had no release
  since 2019 and no commit since 2021. redux-remember is active but small.

### Facts about Serwist BackgroundSyncQueue

Serwist has a `BackgroundSyncQueue` class and a `BackgroundSyncPlugin`.

- The class manages "storing failed requests in IndexedDB and retrying them".
  It stores `Request` objects, not Redux actions. Source:
  [`BackgroundSyncQueue.ts`](https://github.com/serwist/serwist/blob/main/packages/core/src/lib/backgroundSync/BackgroundSyncQueue.ts).
- `maxRetentionTime` defaults to `60 * 24 * 7` minutes, which is 7 days. The
  replay ignores older entries. Source: the same file.
- `registerSync()` registers a `sync` event when the browser supports it.
  `forceSyncFallback` replays at service worker start instead. Source: the same
  file and [BackgroundSyncQueue docs](https://serwist.pages.dev/docs/serwist/core/background-sync-queue).
- `replayRequests()` replays each request in order. A failed request goes
  back to the same position. Source:
  [BackgroundSyncQueue docs](https://serwist.pages.dev/docs/serwist/core/background-sync-queue).
- Serwist 9.5.12 is in this repository. The repository is active, last push
  2026-07-22, MIT. Source:
  [GitHub API, serwist/serwist](https://api.github.com/repos/serwist/serwist).

Conclusion: `BackgroundSyncQueue` is a queue of HTTP requests with a 7-day
default age limit. It is not the persisted store. The project can use it as
the transport for the closed-app flush, with `maxRetentionTime` set to a value
above 180 days, or it can write its own `sync` handler that reads the queue
slice. In both cases the write authority stays with the API.

## Candidate 3: TanStack Query persistence

Packages: `@tanstack/query-persist-client-core` and
`@tanstack/query-async-storage-persister`.

### Facts

- **Latest release:** 5.102.8, published 2026-08-27. Source:
  [npm registry](https://registry.npmjs.org/@tanstack/query-persist-client-core).
- **What it persists.** It dehydrates queries and mutations to a storage. The
  default `maxAge` is 24 hours. Older data is discarded. A `buster` string
  discards the whole cache when it changes. `gcTime` must be equal to or above
  `maxAge`. Source:
  [persistQueryClient](https://tanstack.com/query/latest/docs/framework/react/plugins/persistQueryClient).
- **Paused mutations.** The default network mode is `online`. Mutations do not
  fire without a connection. Source:
  [Network Mode](https://tanstack.com/query/latest/docs/framework/react/guides/network-mode).
  Paused mutations "will be retried in the same order when the device
  reconnects". Mutations run in parallel by default. Mutations with the same
  `scope.id` run in series. Only the state of a mutation is persisted,
  "as functions cannot be serialized", so `setMutationDefaults` must supply the
  mutation function on hydration. `resumePausedMutations` runs after restore.
  Source: [Mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations).
- **Dehydrated shape of a mutation.** `mutationKey`, `state`, `scope`, and
  `meta`. There is no mutation id. Source:
  [`hydration.ts`](https://github.com/TanStack/query/blob/main/packages/query-core/src/hydration.ts).
- **Storage.** `createAsyncStoragePersister` accepts any storage with
  `getItem`, `setItem`, and `removeItem`. Source:
  [createAsyncStoragePersister](https://tanstack.com/query/latest/docs/framework/react/plugins/createAsyncStoragePersister).

### Answers to the questions of the issue

- **API as write authority:** Yes. A mutation is a request to the API.
- **Idempotency key and ordered replay:** Partial. The order is kept. Serial
  replay needs a `scope.id`. There is no idempotency key; the project must put
  one in the variables.
- **180-day gap, eviction, version upgrade:** `maxAge` can be raised. The
  `buster` mechanism discards the whole cache, including paused mutations, on
  a version change. There is no migration function for the persisted shape.
- **Service worker flush:** No. The QueryClient lives in the page.
- **Maintenance:** Active.
- **Fit with the constraints:** TanStack Query is a second state layer beside
  the Redux store. #174 requires one persisted Redux Toolkit store with slices
  and selectors. This candidate does not fit that constraint.

## Candidate 4: Replicache

### Facts

- **Latest release:** 15.3.0, published 2025-07-02. The package in the
  `rocicorp/mono` repository is at version 15.2.1 with license Apache-2.0.
  Source: [npm registry](https://registry.npmjs.org/replicache) and
  [`packages/replicache/package.json`](https://github.com/rocicorp/mono/blob/main/packages/replicache/package.json).
- **Maintenance mode.** The home page says "After five years, thousands of
  developers, and millions of end users, Replicache is now in maintenance
  mode." and "We will continue to support Replicache, but won't add new
  features. Existing users should migrate to Zero as they are able." Source:
  [replicache.dev](https://replicache.dev/).
- **Old repository archived.** `rocicorp/replicache` is archived. Last push
  2022-05-07. Source:
  [GitHub API, rocicorp/replicache](https://api.github.com/repos/rocicorp/replicache).
  The code is in `rocicorp/mono`, last push 2026-09-05. Source:
  [GitHub API, rocicorp/mono](https://api.github.com/repos/rocicorp/mono).
- **Model.** Mutators run on the client and again on the server. The push
  endpoint receives mutations in order. Each mutation has a sequential integer
  id per client. The server keeps a `lastMutationID` per client. "The server
  is authoritative." Source:
  [How Replicache Works](https://doc.replicache.dev/concepts/how-it-works).
  The push endpoint must ignore a mutation with an id at or below
  `lastMutationID`, must ignore a mutation with an id above
  `lastMutationID + 1`, and must update `lastMutationID` in the same
  transaction as the effects. Source:
  [Push Endpoint Reference](https://doc.replicache.dev/reference/server-push).
- **Client garbage collection.** `onClientStateNotFound` "is called when the
  persistent client has been garbage collected. This can happen if the client
  has no pending mutations and has not been used for a while." Source:
  [Class Replicache](https://doc.replicache.dev/api/classes/Replicache).
  `CLIENT_MAX_INACTIVE_TIME` is 24 hours. Source:
  [`client-gc.ts`](https://github.com/rocicorp/mono/blob/main/packages/replicache/src/persist/client-gc.ts).
  "Replicache does not currently support deleting client records from the
  server." Source:
  [Pull Endpoint Reference](https://doc.replicache.dev/reference/server-pull).

### Answers to the questions of the issue

- **API as write authority:** Yes. The server runs each mutator and its result
  is canonical.
- **Idempotency key and ordered replay:** Yes. The mutation id per client is
  the key, and the push is in order. This is the strongest queue design in the
  comparison.
- **180-day gap, eviction, version upgrade:** The data is in IndexedDB. The
  client GC runs at 24 hours of inactivity. The server must keep every client
  record. A schema version change makes a new client group. No primary source
  covers pending mutations across a schema version change.
- **Service worker flush:** No. Push runs from the page.
- **Maintenance:** Maintenance mode. No new features. The vendor asks users to
  migrate to Zero.
- **Fit with the constraints:** Replicache is a second state layer with its
  own store and mutators. The API must implement the push, pull, client view,
  and version protocol. It does not fit the one-Redux-store constraint.

## Candidate 5: RxDB

### Facts

- **Latest release:** 17.5.0, published 2026-08-20. Apache-2.0 core. Source:
  [npm registry](https://registry.npmjs.org/rxdb).
- **Repository.** Not archived. Last push 2026-09-04. 20 open issues. Source:
  [GitHub API, pubkey/rxdb](https://api.github.com/repos/pubkey/rxdb).
- **Premium plugins.** The IndexedDB, OPFS, SQLite, Worker, and SharedWorker
  storages are paid. The Pro tier is USD 99 per month, paid annually. Source:
  [RxDB Premium](https://rxdb.info/premium/).
- **Replication protocol.** The push handler gets rows with
  `assumedMasterState` and `newDocumentState`. It returns the master states of
  the conflicts. RxDB resolves all conflicts on the client with a conflict
  handler, then pushes again. The master is the authority. Source:
  [Replication](https://rxdb.info/replication.html).
- **Migration.** `migrationStrategies` transform documents between schema
  versions. The migration also runs on the internal replication state, but
  not on the pull checkpoint. Source:
  [Schema Migration](https://rxdb.info/migration-schema.html).
- **Service worker.** "While you can use RxDB inside of a ServiceWorker, you
  cannot use the ServiceWorker as a RxStorage". Source:
  [SharedWorker RxStorage](https://rxdb.info/rx-storage-shared-worker.html).

### Answers to the questions of the issue

- **API as write authority:** Partial. The server accepts or rejects a
  document state. The client computes the merge and pushes again.
- **Idempotency key and ordered replay:** No. The push carries document
  states, not operations. There is no per-operation key. A delta such as "add
  the leg to the Distance" is not representable.
- **180-day gap, eviction, version upgrade:** IndexedDB storage. Migrations
  cover the documents and the replication state.
- **Service worker flush:** Possible in principle. No documented pattern.
- **Maintenance:** Active. The useful storages are paid.
- **Fit with the constraints:** RxDB is a database and a second state layer.
  It does not fit the one-Redux-store constraint.

## Candidate 6: Dexie

### Facts

- **Latest release:** 4.4.5, published 2026-08-14. Apache-2.0. Source:
  [npm registry](https://registry.npmjs.org/dexie).
- **Repository.** Not archived. Last push 2026-08-28. Source:
  [GitHub API, dexie/Dexie.js](https://api.github.com/repos/dexie/Dexie.js).
- **What it is.** A wrapper around IndexedDB. Schema versions use
  `db.version(n).stores()` with an `upgrade()` function. Source:
  [Design](https://dexie.org/docs/Tutorial/Design).
- **Sync.** Sync is a feature of Dexie Cloud, which needs a Dexie Cloud server,
  hosted or self-hosted. Source: [Dexie Cloud](https://dexie.org/cloud/). The
  Dexie Cloud add-on can sync from a service worker "after you app has been
  closed". Source:
  [db.cloud.usingServiceWorker](https://dexie.org/cloud/docs/db.cloud.usingServiceWorker).
  Dexie core has no write queue.

### Answers to the questions of the issue

- **API as write authority:** Not applicable. Dexie core has no sync.
- **Idempotency key and ordered replay:** No. The project would write the
  queue.
- **180-day gap, eviction, version upgrade:** IndexedDB with versioned
  upgrades.
- **Service worker flush:** Yes. Dexie runs in a service worker, as the Dexie
  Cloud add-on shows.
- **Maintenance:** Active.
- **Fit with the constraints:** Dexie is a storage layer, not a state layer.
  It can be the IndexedDB engine below the persisted Redux store. It is more
  than that job needs. `idb-keyval` covers a key-value engine in one
  dependency.

## Candidate 7: PowerSync as a download engine only

### Facts

- **Latest release:** `@powersync/web` 2.3.0, published 2026-09-02.
  Apache-2.0. Source: [npm registry](https://registry.npmjs.org/@powersync/web).
- **Service license.** The PowerSync Service is under the Functional Source
  License 1.1 with an Apache-2.0 future license. Source:
  [LICENSE](https://github.com/powersync-ja/powersync-service/blob/main/LICENSE).
- **Download-only use.** The backend connector can omit `uploadData()` "if you
  only want to sync data from the database to the client". The SDK stores data
  in SQLite through wa-sqlite on IndexedDB or OPFS. Multi-tab uses a shared
  worker on desktop, off by default on Android. Source:
  [JavaScript Web SDK](https://docs.powersync.com/client-sdk-references/javascript-web).
- **Write queue.** The CRUD queue holds `PUT`, `PATCH`, and `DELETE` entries.
  A `PATCH` "contains the ID, and value of each changed column". Delta
  operations are not supported: "Future versions may include support for
  custom operations, e.g. 'increment column by 1'". The backend applies the
  writes. Source:
  [Handling Update Conflicts](https://docs.powersync.com/usage/lifecycle-maintenance/handling-update-conflicts).

### Answers to the questions of the issue

- **API as write authority:** Yes, in the write path. The download path
  bypasses the API and reads the database through the PowerSync Service.
- **Idempotency key and ordered replay:** Partial. The CRUD queue has a
  transaction id and an order. It has no delta operations, so Rig Distance
  needs a workaround.
- **180-day gap, eviction, version upgrade:** SQLite on IndexedDB or OPFS.
- **Service worker flush:** No documented service worker support.
- **Maintenance:** Active.
- **Fit with the constraints:** A download-only PowerSync keeps a second store
  on the device, a SQLite database, beside the Redux store. The data would
  then copy from SQLite into Redux slices. It also keeps the PowerSync Service
  and the sync rules in the deployment. #174 bins PowerSync unless a ticket
  shows a significant technical advantage. A download engine that duplicates
  the store is not a significant advantage.

## Comparison table

| Constraint | redux-offline | RTK alone | TanStack persist | Replicache | RxDB | Dexie | PowerSync download-only |
| --- | --- | --- | --- | --- | --- | --- | --- |
| One Redux store holds the data | Yes | Yes | No, second layer | No, second layer | No, second layer | Storage only | No, second store |
| API keeps write authority | Yes | Yes | Yes | Yes | Partial, client merges | No sync | Yes for writes |
| Idempotency key per operation | Counter per device | Project code | No | Yes, mutation id | No | No | Transaction id |
| Ordered replay | Yes | Project code | Yes with scope | Yes | Document states | No | Yes |
| Delta operation for Distance | Yes, any action | Yes, any action | Yes, any variables | Yes, mutator | No | No | No |
| 180-day gap | No age limit | No age limit | maxAge default 24 h | Client GC at 24 h | Yes | Yes | Yes |
| Version upgrade of the shape | No migrate in v4 | createMigrate or redux-remigrate | buster drops all | New client group | migrationStrategies | version().upgrade() | Not documented |
| Service worker flush | No | Shared module plus Serwist sync | No | No | Undocumented | Yes | No |
| Maintenance | Deprecated, archived | RTK active; persist lib old or small | Active | Maintenance mode | Active, paid storages | Active | Active |
| Extra server component | None | None | None | Push, pull, client view | Replication endpoints | Dexie Cloud | PowerSync Service |

## Recommendation

Use Redux Toolkit alone. Do not use redux-offline.

The design:

1. **A queue slice.** Each entry is one operation with a UUID as the
   idempotency key, a sequence number, the action type, the payload, and the
   client edit time. A Distance change is a delta entry.
2. **A listener on `createListenerMiddleware`.** It watches the queue slice.
   When the device is online, it sends the head entry to the API with the
   UUID in a header. It waits for the response. On success, it dequeues. On a
   network error, it retries with back-off. On a 4xx response, it applies the
   rollback rule of the write and dequeues.
3. **The persisted store in IndexedDB.** Use `redux-persist` 6.0.0 with a
   custom engine over `idb-keyval`, and `createMigrate` for the version
   upgrades. The persist config has a `version`. Persist the queue slice and
   the entity slices. Do not persist the RTK Query slice.
4. **The closed-app flush.** The page registers a Background Sync tag after
   each enqueue. The Serwist service worker handles the `sync` event with the
   same send module. It reads the persisted queue record from IndexedDB and
   sends the entries in order. Chromium gives 3 attempts per registration, so
   the page registers the tag again on each open.
5. **`navigator.storage.persist()`** at sign-in, so that Chromium does not
   evict the origin under storage pressure.

The reasons:

- redux-offline is deprecated on npm and archived on GitHub. Its last release
  is from 2020. It pins redux-persist v4, which has no migration utility. Its
  queue and retry logic total about 40 lines of source. The project would
  carry a dead dependency for that.
- Redux Toolkit already contains the two parts that redux-offline gives: a
  slice for the outbox and a middleware for the side effects.
  `createListenerMiddleware` is an official part of Redux Toolkit since 2022.
- TanStack Query, Replicache, RxDB, and PowerSync each add a second state
  layer or a second store. #174 requires one persisted Redux Toolkit store.
  Replicache is in maintenance mode. RxDB pushes document states, not
  operations, so it cannot carry the Distance delta. PowerSync has no delta
  operations and is binned by #174.
- Dexie is a fine IndexedDB engine but the persisted store needs one
  key-value record, and `idb-keyval` does that in one small active package.
- No library provides an idempotency key per operation and an ordered replay
  for a Redux store. The queue slice and the listener are project code in
  every candidate that fits the one-store constraint.

The choice between redux-persist and redux-remember:

- redux-persist is the library that the Redux Toolkit usage guide documents.
  It has 593 open issues and no release since 2019, but its API is stable and
  it works with Redux 5, as the usage guide shows. Its `createMigrate` covers
  the version upgrade.
- redux-remember is active and tested with Redux Toolkit 2. It has one
  maintainer and 131 stars.
- Recommend redux-persist, because the Redux team documents it. The
  persistence seam is one storage engine and one migration table. If
  redux-persist blocks a Redux upgrade, a swap to redux-remember is small
  work.

Open points for the ADR that follows:

- The service worker and the page must agree on one IndexedDB record format
  for the queue. The redux-persist record is a JSON string per slice under
  one key. The service worker must parse that string and write it back after a
  successful send, or the page must reconcile on the next open. The write
  queue ADR decides this.
- Serwist `BackgroundSyncQueue` stores HTTP requests with a 7-day default
  retention. If the ADR uses it as the transport, set `maxRetentionTime`
  above 180 days.

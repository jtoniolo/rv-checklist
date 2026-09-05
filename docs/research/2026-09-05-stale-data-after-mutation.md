# Stale data after a mutation: why a data change needs a page reload today

Date: 2026-09-05

Issue: [#178](https://github.com/jtoniolo/rv-checklist/issues/178), part of
map [#174](https://github.com/jtoniolo/rv-checklist/issues/174).

## Question

Which user operations in the web application change data without a redraw of
the pages that show that data?

## Method

This document reads the local sources only. It does not run the application.
Each claim cites a file path and a line number. Line numbers refer to the
commit `76e2c7a62` on `main`. Redux Toolkit line numbers refer to the installed
package, version 2.12.0, under
`node_modules/.pnpm/@reduxjs+toolkit@2.12.0_*/node_modules/@reduxjs/toolkit/src/`.

The sources:

- `libs/web/data-access/src/lib/api.ts`: the mutations and the queries.
- `libs/web/data-access/src/lib/powersync/watch.ts` and
  [ADR-0029](../adr/0029-powersync-read-path-into-rtk-query.md): the local
  watch feed and its first-sync gate.
- `apps/web/src/lib/cache-seeder.tsx` and
  `libs/web/data-access/src/lib/seed-cache.ts`: the SSR seed and its guard.
- The screens under `apps/web/src/app/` and the components in
  `libs/web/ui/src/`: local state that copies query data.
- The API services under `apps/api/src/app/`: the side effects of each write.

## Summary

- 37 mutations exist. 3 fail: `deleteChecklist`, `updateRun`, and
  `applyRunStepOps`. Each one changes rows that a query shows, and the mutation
  does not invalidate the tag of that query.
- One screen keeps a copy of query data in React state. The run screen copies
  the run's steps once (`apps/web/src/app/run-screen.tsx:139`). A refetch of the
  run does not redraw the steps.
- A change that does not come from the page's own mutation has one path to the
  page: the PowerSync watch. This includes a change from a second device and an
  attachment that the service worker uploads from the outbox. The watch has four
  gates. When a gate holds, nothing refreshes the page. There is no refetch on
  focus, on reconnect, on mount, or on a timer.
- The SSR seed does not replace cached data. On a client-side navigation the
  page shows the cache, not the fresh server payload. A full reload builds a new
  store, and that is why a reload shows the change.

## How the cache refreshes today

### 1. Tag invalidation

A mutation lists tags in `invalidatesTags`. Redux Toolkit finds each query entry
that provides one of those tags
(`query/core/buildMiddleware/invalidationByTags.ts:111`). An entry with a
subscriber refetches (`invalidationByTags.ts:130-131`). An entry with no
subscriber is removed (`invalidationByTags.ts:124-129`). A hook subscribes while
its component is mounted.

The library also registers `providesTags` for entries that arrive through
`upsertQueryEntries` (`query/core/buildSlice.ts:571-588`). So the SSR seed and
the PowerSync watch both produce entries that invalidation reaches. ADR-0029
decision 1 depends on this, and the installed version does it.

Invalidation is `delayed` by default (`query/createApi.ts:363`). While any
request is in flight, the library holds every invalidation
(`invalidationByTags.ts:100-105`) and releases them when a request ends
(`invalidationByTags.ts:70-71`). A request that never ends holds every
invalidation on the page. `fetchBaseQuery` sets no timeout (`api.ts:99-102`).

### 2. The PowerSync watch

Eleven queries open a local watch in `onCacheEntryAdded` (`api.ts:236-246` and
the ten like it). The watch pushes rows from the local SQLite store into the
cache entry with `upsertQueryEntries` (`watch.ts:99-102`). It runs once when it
opens and again on each change of its tables (`watch.ts:111-112`).

The watch has four gates:

1. The host must have `window`, `Worker`, `indexedDB`, and `WebAssembly`
   (`powersync/browser-store.ts:14-21`). Without them, `open()` returns
   `undefined` and the watch ends (`watch.ts:91`).
2. The open must succeed. A failed open is reported once and the watch ends
   (`watch.ts:79-91`).
3. The store must have completed one sync. `waitForFirstSync` blocks every
   emission until then (`watch.ts:93`; ADR-0029 decision 3). On a device that
   has never synced, the watch emits nothing.
4. Replication must run. The connector returns `null` credentials on a 401
   after a refresh, and on an owner mismatch (`powersync/connector.ts:116-162`).
   The SDK then stops. The local store keeps its old rows, and the watch emits
   those rows on each new subscription.

The watch is the only path for a change that the page did not make itself.
There is no other refetch trigger. `setupListeners` runs (`store.ts:30`), but
`createApi` does not set `refetchOnFocus` or `refetchOnReconnect`
(`api.ts:165-181`). The defaults are `false` (`query/createApi.ts:360-362`). No
hook passes `refetchOnMountOrArgChange` or `pollingInterval`: a search for those
names in `apps/web/src` and `libs/web` finds nothing. No code outside `api.ts`
and `seed-cache.ts` dispatches `invalidateTags` or `upsertQueryEntries`.

### 3. The SSR seed and its guard

Each server page fetches its data with `cache: 'no-store'`
(`apps/web/src/lib/server-api.ts:58-61`) and passes it to `CacheSeeder`
(`apps/web/src/lib/cache-seeder.tsx:71-101`). Each seed helper skips when the
store already holds a fulfilled entry for the same endpoint and argument
(`seed-cache.ts:39-46`). The guard was added for Back/Forward navigation (issue
#134).

Three facts make the guard show stale data on a client-side navigation:

- The store lives for the whole client session (`store-provider.tsx:18-19`).
  Only a full reload builds a new one.
- An entry with no subscriber stays fulfilled for 60 seconds
  (`query/createApi.ts:359`). During that time the seed skips it, and a hook
  that mounts on it does not fetch.
- `RigShell` subscribes to `me`, `listRigs`, and `listTripsByRig(rigId)` for the
  whole rig-scoped session (`apps/web/src/app/rig/[rigId]/rig-shell.tsx:68-70`).
  Those three entries are always fulfilled. The seed never replaces them.

For data that a mutation invalidates, the guard is correct: the entry was
refetched or removed before the navigation. For data that a mutation does not
invalidate (the failing rows below) and for data changed on another device, the
page shows the cache. The server sent the fresh rows, and the client discarded
them.

### 4. The precedence between the watch and the seed

On a returning device the watch emits as soon as it opens (ADR-0029 decision 3
and 4; `watch.ts:93,112`). That emission replaces the SSR seed
(`watch.ts:99-102`). When replication lags, or gate 4 holds, the page shows the
local store's older rows over the fresh server rows. ADR-0029 accepts this
(`docs/adr/0029-powersync-read-path-into-rtk-query.md:209-214`).

## The table

One row per `builder.mutation` in `api.ts`, in file order. "Refetch" says
whether each listed query refetches after the mutation, given that a hook
subscribes to it. Tags are written as `Type:id`. FAIL marks a row where a query
that shows the changed data does not refetch.

| # | Mutation (`api.ts` line) | Invalidates | Queries that show the changed data | Refetch | Result |
|---|---|---|---|---|---|
| 1 | `loginWithGoogle` (188) | `Me`, `Rig` by dispatch (202) | `me`, `listRigs` | yes, yes | pass |
| 2 | `logout` (206) | none; `resetApiState` (216) | all | all entries cleared | pass |
| 3 | `createRig` (249) | `Rig:LIST` (252) | `listRigs` | yes | pass |
| 4 | `updateRig` (255) | `Rig:id`, `Rig:LIST` (262-265) | `listRigs` | yes | pass |
| 5 | `deleteRig` (268) | `Rig:id`, `Rig:LIST` (270-273) | `listRigs` | yes | pass |
| 6 | `createChecklist` (299) | `Checklist:LIST:rigId` (302-304) | `listChecklists(rigId)` | yes | pass |
| 7 | `updateChecklist` (307) | `Checklist:id`, `Checklist:LIST:rigId` (317-322) | `listChecklists(rigId)` | yes | pass |
| 8 | `deleteChecklist` (325) | `Checklist:id` (327) | `listChecklists(rigId)`; `listRunsByRig(rigId)`; `listRunsByTrip(tripId)`; `listTripsByRig(rigId)` | yes; no; no; no | **FAIL** (a) |
| 9 | `createRun` (416) | `Run:LIST:checklistId`, `Run:RIG:rigId`, `Run:TRIP:tripId` (419-427) | `listRuns`, `listRunsByRig`, `listRunsByTrip` | yes, yes, yes | pass |
| 10 | `updateRun` (430) | `Run:id`, `Run:LIST:checklistId` (437-442) | `getRun`, `listRuns`, `listRunsByRig`, `listRunsByTrip`; `listLogEntries(taskId)`; `listLogEntriesByRig(rigId)` | yes x4; no; no | **FAIL** (b) |
| 11 | `applyRunStepOps` (456) | `Run:id`, `Run:LIST:checklistId` (467-472) | `getRun`, `listRuns`, `listRunsByRig`, `listRunsByTrip`; `listLogEntries(taskId)`; `listLogEntriesByRig(rigId)` | yes x4; no; no | **FAIL** (b, c) |
| 12 | `deleteRun` (475) | `Run:id` (477) | `getRun`, `listRuns`, `listRunsByRig`, `listRunsByTrip` | yes x4 | pass |
| 13 | `createTrip` (503) | `Trip:LIST:rigId` (506-508) | `listTripsByRig(rigId)` | yes | pass |
| 14 | `updateTrip` (511) | `Trip:id`, `Trip:LIST:rigId` (521-524) | `listTripsByRig(rigId)` | yes | pass (d) |
| 15 | `setStopArrived` (527) | `Trip:id`, `Trip:LIST:rigId`, `Rig:id`, `Rig:LIST` (538-543) | `listTripsByRig(rigId)`, `listRigs` | yes, yes | pass |
| 16 | `deleteTrip` (546) | `Trip:LIST:rigId` (548-550) | `listTripsByRig(rigId)`; `listRunsByRig`, `listRuns` | yes; no, no | pass (e) |
| 17 | `createStop` (553) | `Trip:tripId` (556-558) | `listTripsByRig(rigId)` | yes (f) | pass |
| 18 | `updateStop` (561) | `Trip:id`, `Trip:LIST:rigId`, and `Rig:id`, `Rig:LIST` when an arrived leg changes (573-582) | `listTripsByRig(rigId)`, `listRigs` | yes, yes | pass |
| 19 | `deleteStop` (585) | `Trip:id`, `Trip:LIST:rigId`, `Rig:id`, `Rig:LIST` (588-593) | `listTripsByRig(rigId)`, `listRigs` | yes, yes | pass |
| 20 | `reorderStop` (596) | `Trip:id`, `Trip:LIST:rigId` (606-609) | `listTripsByRig(rigId)` | yes | pass |
| 21 | `uploadAttachment` (615) | `Trip:id`, `Trip:LIST:rigId` (628-631) | `listTripsByRig(rigId)` | yes | pass (g) |
| 22 | `setCampgroundMap` (634) | `Trip:id`, `Trip:LIST:rigId` (646-649) | `listTripsByRig(rigId)` | yes | pass |
| 23 | `deleteAttachment` (652) | `Trip:id`, `Trip:LIST:rigId` (655-658) | `listTripsByRig(rigId)` | yes | pass |
| 24 | `routeDistance` (677) | none | none; the result fills a form field only | not applicable | pass |
| 25 | `createTask` (710) | `Task:LIST:rigId` (713-715) | `listTasks(rigId)` | yes | pass |
| 26 | `updateTask` (718) | `Task:id`, `Task:LIST:rigId` (728-733) | `listTasks(rigId)` | yes | pass |
| 27 | `deleteTask` (736) | `Task:id`, `LogEntry:RIG:rigId` (738-741) | `listTasks(rigId)`, `listLogEntriesByRig(rigId)`; `listLogEntries(taskId)` | yes, yes; no | pass (h) |
| 28 | `createLogEntry` (790) | `LogEntry:LIST:taskId`, `LogEntry:RIG:rigId`, `Task:LIST:rigId` (793-801) | `listLogEntries(taskId)`, `listLogEntriesByRig(rigId)`, `listTasks(rigId)` | yes x3 | pass |
| 29 | `updateLogEntry` (804) | `LogEntry:id`, `Task:LIST:rigId` (816-821) | `listLogEntries(taskId)`, `listLogEntriesByRig(rigId)`, `listTasks(rigId)` | yes x3 | pass |
| 30 | `deleteLogEntry` (826) | `LogEntry:id`, `Task:LIST:rigId` (828-831) | `listLogEntries(taskId)`, `listLogEntriesByRig(rigId)`, `listTasks(rigId)` | yes x3 | pass |
| 31 | `createEquipment` (860) | `Equipment:LIST:rigId` (863-865) | `listEquipment(rigId)` | yes | pass |
| 32 | `updateEquipment` (868) | `Equipment:id`, `Equipment:LIST:rigId` (878-883) | `listEquipment(rigId)` | yes | pass (d) |
| 33 | `deleteEquipment` (886) | `Equipment:id`, `Equipment:LIST:rigId` (888-891) | `listEquipment(rigId)` | yes | pass |
| 34 | `generateMcpToken` (900) | `McpToken` (903) | `mcpTokenStatus` | yes | pass |
| 35 | `revokeMcpToken` (906) | `McpToken` (908) | `mcpTokenStatus` | yes | pass |
| 36 | `revokeOAuthGrant` (926) | `OAuthGrant:id`, `OAuthGrant:LIST` (928-931) | `listOAuthGrants` | yes | pass |
| 37 | `revokeWebSession` (949) | `WebSession:id`, `WebSession:LIST` (954-957) | `listWebSessions` | yes | pass |

Notes:

- (a) The database deletes the runs of a deleted checklist:
  `libs/api/data-access/src/lib/entities/run.entity.ts:12-16`
  (`ON DELETE CASCADE` on `checklist_id`). `listRunsByRig` feeds the last-run
  date on the checklists screen (`apps/web/src/app/checklists-screen.tsx:46,
  106-109`). `listRunsByTrip` feeds the run cards on the trip screen
  (`apps/web/src/app/trip-screen.tsx:122`). `listTripsByRig` holds
  `checklistIds`, which the API filters against live checklists on read
  (`libs/shared/domain/src/lib/trip.ts:235-246`); the trip screen resolves the
  ids through `listChecklists` (`trip-screen.tsx:527-529`), so this last one
  shows the right result by accident. The cached lists keep the deleted runs
  until the next full reload, or until the watch emits.
- (b) A step operation that completes a task-linked step writes a Log Entry,
  and one that leaves `complete` deletes the entry
  (`apps/api/src/app/run/run.service.ts:124-139, 259-264, 306-345`).
  `updateRun` turns a full array into the same operations
  (`run.service.ts:156-157`). The two mutations invalidate only `Run` tags.
  The due status of a task is computed on the client from the task, the rig's
  log entries, and the rig distance (`apps/web/src/app/dashboard-screen.tsx:
  46-54`; `apps/web/src/app/maintenance-screen.tsx:139-140`;
  `libs/shared/domain/src/lib/due-status.ts:1-23`). So the dashboard badges,
  the maintenance list, the task history, and the rig history show the old
  standing after a run completes a task. No screen calls `updateRun`; the row
  fails on the same cause.
- (c) The run screen copies `run.steps` into React state once
  (`apps/web/src/app/run-screen.tsx:135-139`). The `getRun` entry refetches
  (`Run:id`), and the component ignores the new value. See cause 2.
- (d) The trip fields form and the equipment item form copy the entity into
  React state once (`apps/web/src/app/trip-editor-screen.tsx:133-135`;
  `apps/web/src/app/rig-settings-screen.tsx:201-210`). After the owner's own
  save the values are equal, so the row passes. A change from elsewhere does
  not redraw the form while it is mounted. See cause 2.
- (e) Deleting a trip sets `tripId` to null on its runs
  (`apps/api/src/app/trips/trip.service.ts:229-231`;
  `run.entity.ts:42-45`). No screen shows `run.tripId`, so the stale field is
  not visible.
- (f) `createStop` invalidates only `Trip:tripId`. This reaches
  `listTripsByRig` because that query provides one `Trip:id` tag per trip
  (`api.ts:483-489`).
- (g) An offline capture does not call `uploadAttachment`. It goes to the
  IndexedDB outbox (`apps/web/src/app/stop-attachments.tsx:138-152`), and the
  service worker replays it (`apps/web/sw/outbox-flush.ts:98`). No code
  invalidates `Trip` after the replay. The new attachment reaches the trip
  screen only through the watch. See cause 3.
- (h) Deleting a task keeps its log entries with `taskId` set to null
  (`libs/api/data-access/src/lib/entities/log-entry.entity.ts:16-17`). The
  screen leaves the task detail on delete
  (`apps/web/src/app/maintenance-screen.tsx:241`), so `listLogEntries(taskId)`
  has no subscriber and is not shown.

## Causes, grouped

### Cause 1. The mutation does not name the rows the API also changes

Three mutations invalidate the tag of the entity they edit and not the tags of
the rows the API changes at the same time:

- `deleteChecklist` deletes runs (`run.entity.ts:12-16`) and invalidates
  `Checklist:id` only (`api.ts:327`).
- `applyRunStepOps` and `updateRun` write and delete log entries
  (`run.service.ts:306-345`) and invalidate `Run` tags only
  (`api.ts:437-442, 467-472`).

The pattern is known in the file: `setStopArrived`, `updateStop`, `deleteStop`,
`deleteTask`, `createLogEntry`, `updateLogEntry`, and `deleteLogEntry` each add
the tag of the second entity that the API touches (`api.ts:537-543, 571-582,
587-593, 738-741, 793-801, 814-821, 824-831`). The three failing rows do not.

### Cause 2. A component copies query data into React state

- `RunWorkspace` seeds `steps` from `run.steps` once and treats local state as
  the source of truth for the session (`run-screen.tsx:135-139`). The
  component is keyed on `run.id` (`run-screen.tsx:74`), so only a change of
  run remounts it. A refetch of `getRun`, a watch emission, or a step completed
  on another device does not redraw the steps. The `logEntryId` that the server
  writes on the step (`run.service.ts:340`) never reaches local state.
- `TripFieldsForm` copies `name`, `startLocation`, and `startPlaceId`
  (`trip-editor-screen.tsx:133-135`). `EquipmentRow` copies six fields
  (`rig-settings-screen.tsx:201-210`). Both stay mounted after a save.
- The forms `TaskForm`, `ChecklistForm`, `RigForm`, `LogEntryForm`, and the stop
  form copy `initial` once (`task-form.tsx:133-155`; `checklist-form.tsx:
  149-157`; `rig-form.tsx:131`; `log-entry-form.tsx:99-107`;
  `trip-editor-screen.tsx:640-666`). These mount for one edit and unmount on
  save, so they do not show stale data today. They are the same pattern.

`libs/web/ui/src/` holds no component that copies query data. Its components
take props only.

### Cause 3. A change from outside the page has one path, and that path has gates

The PowerSync watch is the only way a change reaches the page when the page did
not make it. That covers:

- a change on a second device;
- an attachment that the service worker uploads from the outbox (note g);
- the rows of the three failing mutations, after the fact.

The watch does not emit when a gate holds: no host capability
(`browser-store.ts:14-21`), a failed open (`watch.ts:79-91`), no first sync
(`watch.ts:93`), or stopped replication (`connector.ts:116-162`). When a gate
holds, the page keeps its data until a full reload. No other mechanism exists:
no refetch on focus or reconnect (`api.ts:165-181`;
`query/createApi.ts:360-362`), no refetch on mount, and no polling.

### Cause 4. The SSR seed does not replace cached data on a client-side navigation

The seed guard skips a fulfilled entry (`seed-cache.ts:39-46`). The store lives
for the whole client session (`store-provider.tsx:18-19`). An entry with no
subscriber stays fulfilled for 60 seconds (`query/createApi.ts:359`), and
`RigShell` keeps `me`, `listRigs`, and `listTripsByRig` subscribed for the
whole rig session (`rig-shell.tsx:68-70`). So a navigation to a page shows the
cache, and the fresh rows from `server-api.ts` are discarded. For the failing
rows and for changes from outside, this makes the stale data survive the
navigation. A full reload discards the store, and the seed lands. That is the
reload the owner observes.

### Cause 5. Residuals

- Invalidation is `delayed` (`query/createApi.ts:363`;
  `invalidationByTags.ts:100-105`). One request that never settles holds every
  invalidation on the page. `fetchBaseQuery` sets no timeout (`api.ts:99-102`).
- On a returning device the watch emits its local rows over the fresh SSR seed
  as soon as a subscription opens (`watch.ts:93,112`; ADR-0029 decision 4).
  When replication lags or has stopped, the page shows the older local rows.

## What the slice design must carry

- One dispatch per write must update every slice the API changes, not only the
  slice of the edited entity. Cause 1 shows where the tag list already misses
  this today.
- Components must select from the store on every render. Cause 2 shows the
  three components that need a change, and the form pattern to avoid.
- A sync feed that lands in the store must not depend on a first-run gate or an
  auth-stopped replication to redraw a page. Cause 3 lists the gates.
- A server payload on navigation must not be discarded in favour of the cache,
  or the store must be the only source and the payload must be dropped on
  purpose. Cause 4 shows the current half-way state.

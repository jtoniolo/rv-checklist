# 11. Web state management — Redux Toolkit with RTK Query

Date: 2026-07-17

## Status

Accepted

## Context

The web app (Next.js, ADR-0009) needs a client-side state approach. Most of
the app's state is **server state** — checklists, runs, tasks, log entries
fetched from the NestJS API — plus a small amount of genuinely client-local
state (active-run UI state, selected rig). The owner's stated preference is
Redux Toolkit.

## Decision

- **Redux Toolkit** is the web app's state layer, living in
  `libs/web/data-access` (ADR-0009).
- **RTK Query owns all server state**: API fetching, caching, and
  invalidation. Entities map to RTK Query tag types (rigs, checklists, runs,
  tasks, log entries), so mutations invalidate exactly the reads they affect.
- **Plain RTK slices only for client-local state** — state that exists
  nowhere on the server (e.g. which rig is selected, transient run-screen UI
  state). No hand-written thunks or reducers for API data.
- The store is a client-side store hydrated per route; SSR on the Worker
  (ADR-0001) renders without it where possible.

## Alternatives considered

- **React Query / SWR** — the more common Next.js pairing for server state,
  but it would still leave client-local state needing a home, and the owner
  prefers the single Redux toolchain.
- **RTK slices with hand-rolled fetching (thunks)** — rejected; boilerplate
  RTK Query generates for free, and cache invalidation becomes manual.

## Consequences

- API access from the web app goes through generated RTK Query hooks; adding
  an endpoint means declaring it on the API slice, not writing a thunk.
- Cache correctness rests on disciplined tag usage — every mutation declares
  the tags it invalidates.
- Zod schemas in `libs/shared/domain` (ADR-0009) type the RTK Query
  endpoints, keeping the one-source-of-truth wire model.

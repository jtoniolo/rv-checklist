# 18. True hybrid SSR web architecture

Date: 2026-08-15

## Status

Accepted

Supersedes [ADR-0001](0001-deployment-and-connectivity.md) (web-tier and data-path decisions).
Amends [ADR-0011](0011-redux-rtk-state.md).

## Context

ADR-0001 called the web tier "SSR on a Cloudflare Worker," but the built app is a
client-side SPA masquerading as SSR: a single route renders an empty shell, every
screen is a client component, navigation is client state serialised into search
params, and all content arrives only after client-side fetches. First paint shows
a spinner, not the owner's data. View-source shows nothing. The owner went through
the same correction on aquarify-app and wants the same true hybrid here: a
session-aware server that pre-fetches data, with client-side interactivity where
appropriate.

ADR-0011 established Redux Toolkit with RTK Query as the web state layer, with
the store hydrated per route on the client. That discipline survives, but the
hydration source changes: server-fetched data seeds the RTK Query cache at the
page layer so that feature components read only from hooks.

## Decision

- **Server-rendered signed-in pages.** Every signed-in page is an async server
  component that fetches the owner's data (Rigs, Checklists, Runs, Maintenance
  Tasks, due status) using the request's cookies via a shared server-side API
  helper. The HTML sent to the browser contains the owner's data, not a spinner.
- **Pattern C data seeding (server fetch, cache seed, hooks-only components).**
  The server-fetched result is passed to a small client seeder that upserts it
  into the RTK Query cache. Feature components read **only** from RTK Query
  hooks — no initial-vs-live prop dance, no double fetch, and it works on every
  soft navigation (which per-request `preloadedState` hydration structurally
  cannot). RTK Query keeps owning mutations and tag invalidation per ADR-0011's
  surviving discipline.
- **Rig-scoped URL routes.** The URL fully determines the page. Routes include a
  public welcome route; a root that redirects to the last-visited Rig via a
  cookie used only as a redirect hint; a rig manager route; and per-Rig routes
  for the rig home/dashboard, Checklists (list and detail), Runs (detail),
  Maintenance (list, task detail, history), and Trips (list, new, trip
  detail/dashboard, edit — issue #114). Client-state navigation, its
  history-state serialisation, the active-rig store slice, and its localStorage
  rehydration are deleted — the URL is the active Rig now.
- **Edge middleware.** Guards signed-in routes, redirects signed-out requests to
  the welcome page (preserving the requested URL), silently refreshes near-expiry
  access tokens against the API and forwards Set-Cookie to the browser. Runs on
  the edge runtime (OpenNext does not support the Node middleware successor).
- **Dual JWT extractors.** One JWT strategy with two extractors — cookie (browser
  and SSR) and Authorization bearer (future React Native) — so the API accepts
  sessions from either transport without new server work.

## Alternatives considered

- **Keep the SPA shell and fetch everything client-side** — the status quo. First
  paint is a spinner, view-source is empty, bookmarks and deep links are broken.
  Rejected because it contradicts the SSR decision recorded in ADR-0001 and the
  owner's stated intent.
- **Props-only hydration (no cache seeder)** — aquarify's original pattern. Each
  page passes fetched data as props. It works on first load but breaks on soft
  navigations: the data is stale, leading to a prop-vs-hook dual source of truth.
  Rejected in favour of Pattern C's upsert-into-cache approach.
- **React Server Components with no client store** — eliminates Redux entirely.
  Rejected because ADR-0011's RTK Query discipline is proven and because
  hooks-only components port to React Native unchanged.

## Consequences

- Async server pages fetch the owner's data on every request; app availability
  remains tied to home lab uptime (same as ADR-0001).
- The shared server-side API helper and the cache seeder are new seams that need
  testing; async server pages stay thin glue (fetch, seed, render) with no
  dedicated tests.
- Feature components remain hooks-only, portable to a future React Native client
  unchanged.
- RTK Query tag invalidation discipline (ADR-0011) continues to govern cache
  correctness; the seeder adds entries, it does not replace the invalidation
  model.
- Client-state navigation code, the active-rig slice, and localStorage
  rehydration are removed. The URL is the sole source of truth for "where am I"
  and "which Rig."

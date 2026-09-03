# 18. A true hybrid SSR web architecture

Date: 2026-08-15

## Status

Accepted.

This ADR supersedes the web tier decision and the data path decision of
[ADR-0001](0001-deployment-and-connectivity.md).

This ADR amends [ADR-0011](0011-redux-rtk-state.md).

[ADR-0028](0028-offline-first-pwa-powersync.md) amends this ADR. SSR then
controls the online use only. With no network, a service worker supplies the
pages from its runtime cache, and the components that use hooks only render again
from the local PowerSync store.

Issue [#159](https://github.com/jtoniolo/rv-checklist/issues/159) also amends this
ADR. **SSR now controls the public routes only.**

The signed-in routes become one shell that the client renders. There are two
reasons. First, the model of ADR-0028, with pages in a runtime cache, could not
operate on a detail route whose id was created with no network. Second, the local
store of ADR-0029 removed the spinner on the first paint, and this ADR was written
to correct that spinner.

These decisions of this ADR continue: the rig-scoped URLs, the components that use
hooks only, the RTK Query discipline, the two JWT extractors, and the
authentication guard and the `/welcome` redirect in the edge middleware.

These decisions of this ADR stop: the data fetch on the server and the Pattern C
seeding on the signed-in pages.

Issue [#164](https://github.com/jtoniolo/rv-checklist/issues/164) must supply a
replacement ADR. That work starts after issues
[#161](https://github.com/jtoniolo/rv-checklist/issues/161) to
[#163](https://github.com/jtoniolo/rv-checklist/issues/163) decide the router, the
path that serves the pages, and the root route.

[ADR-0031](0031-web-tier-to-k3s-container.md) amends the edge middleware note:
the middleware becomes `proxy.ts` on the Node runtime in a container in k3s, not
code on the edge runtime. The route guard and the token refresh do not change.

## Context

ADR-0001 named the web tier "SSR on a Cloudflare Worker". But the application that
we built is an SPA on the client that looks like SSR:

- One route renders an empty shell.
- Each screen is a client component.
- The navigation is client state in the search parameters.
- All the content arrives after the requests from the client.

Thus the first paint shows a spinner and not the data of the owner. The source of
the page shows nothing.

The owner made the same correction on the aquarify-app project. The owner wants
the same true hybrid here: a server that knows the session and gets the data
first, with interactivity on the client where that is correct.

ADR-0011 made Redux Toolkit with RTK Query the state layer of the web
application. Each route fills the store on the client.

That discipline continues. But the source of the data changes. The data from the
server fills the RTK Query cache at the page layer. The feature components then
read from hooks only.

## Decision

- **The server renders the signed-in pages.** Each signed-in page is an
  asynchronous server component. It gets the data of the owner with the cookies of
  the request, through a shared API helper on the server. The data is the Rigs,
  the Checklists, the Runs, the Maintenance Tasks, and the due status.

  The HTML that goes to the browser holds the data of the owner. It does not hold
  a spinner.
- **Pattern C fills the data.** In this pattern the server gets the data, a seeder
  puts the data in the cache, and the components use hooks only.

  The page gives the result from the server to a small seeder on the client. That
  seeder writes the result into the RTK Query cache.

  A feature component reads from an RTK Query hook **only**. Thus there is no
  procedure that compares an initial value against a live value, and there is no
  second fetch. This also operates on each soft navigation. A `preloadedState`
  value for each request cannot operate on a soft navigation, because of its
  structure.

  RTK Query continues to own the mutations and the invalidation of the tags. This
  is the discipline of ADR-0011 that continues.
- **The URL routes have a rig in their path.** The URL fully determines the page.
  The routes are:

  - A public welcome route.
  - A root route that redirects to the last rig that the owner visited. A cookie
    holds that rig, and the application uses the cookie as a hint for the
    redirect only.
  - A route to manage the rigs.
  - For each rig: the home page or dashboard of the rig; the Checklists, as a
    list and as a detail page; the Runs, as a detail page; the Maintenance, as a
    list, a task detail page, and a history page; and the Trips, as a list, a new
    trip page, a trip detail page or dashboard, and an edit page. Issue #114
    covers the Trips.

  We delete the navigation that uses client state, the code that puts that state
  in the history, the store slice that holds the active rig, and the code that
  reads that slice from localStorage. The URL now holds the active rig.
- **Middleware at the edge.** The middleware protects the signed-in routes. It
  redirects a request with no session to the welcome page, and it keeps the URL
  that the user requested.

  The middleware also refreshes an access token that is near its expiry. It does
  this quietly against the API, and it sends the `Set-Cookie` header to the
  browser.

  The middleware operates on the edge runtime, because OpenNext does not support
  the Node middleware that follows it.
- **Two JWT extractors.** There is one JWT strategy with two extractors. The
  first extractor reads a cookie, for the browser and for the SSR. The second
  extractor reads an Authorization bearer header, for a React Native application
  in the future.

  Thus the API accepts a session from either transport, and the server needs no
  new work.

## Alternatives that we compared

- **Keep the SPA shell and get all the data on the client.** This is the current
  condition. The first paint is a spinner, the source of the page is empty, and
  the bookmarks and the deep links do not operate.

  We rejected this alternative, because it disagrees with the SSR decision in
  ADR-0001 and with the intention of the owner.
- **Fill the data with props only, and use no cache seeder.** This is the original
  pattern of the aquarify project. Each page gives the data to the components as
  props.

  This pattern operates on the first load. But it fails on a soft navigation,
  because the data is then old. That gives two sources of truth: the prop and the
  hook. We rejected this alternative and selected the Pattern C method, which
  writes into the cache.
- **React Server Components, with no store on the client.** This alternative
  removes Redux fully. We rejected it. The RTK Query discipline of ADR-0011
  operates correctly. Also, a component that uses hooks only moves to React Native
  with no change.

## Consequences

- An asynchronous server page gets the data of the owner on each request. Thus the
  availability of the application still depends on the availability of the
  self-hosted API. This is the same as ADR-0001.
- The shared API helper on the server and the cache seeder are new parts, and they
  need tests. An asynchronous server page stays a thin connection that gets the
  data, seeds the cache, and renders. Such a page has no tests of its own.
- A feature component uses hooks only. Thus it moves to a React Native client in
  the future with no change.
- The discipline for the invalidation of the RTK Query tags, from ADR-0011,
  continues to control the correctness of the cache. The seeder adds entries. It
  does not replace the model of the invalidation.
- We remove the navigation code that uses client state, the slice that holds the
  active rig, and the code that reads that slice from localStorage. The URL
  becomes the only source of truth for the location of the user and for the active
  rig.

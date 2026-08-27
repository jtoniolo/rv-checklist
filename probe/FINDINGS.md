# Probe: is the Next 16 App Shell an addressable document for an unseen id?

Throwaway prototype for [#165](https://github.com/jtoniolo/rv-checklist/issues/165). Not production code.
Nothing here is meant to be merged to `main`.

- Next **16.3.3** (Turbopack), React 19, `@opennextjs/cloudflare` **1.20.4**, wrangler 4.127.0, Node 25.9.0.
- Two routes: `/thing/[id]` reads the id **only on the client**; `/serverthing/[id]` reads `params` on the **server**.

## How to re-run

```bash
npm install
npx next build                     # cacheComponents: true
npx next start -p 4319             # the "online" origin

# cold navigation to an id that never existed, with a precached shell only
PORT=4332 OFFLINE=1 node sw-sim.mjs   && node probe.mjs http://127.0.0.1:4332/thing/made-offgrid-abc

# same, with the /_full segment payload precached too
PORT=4333 OFFLINE=1 node sw-sim2.mjs  && node probe.mjs http://127.0.0.1:4333/thing/never-ever-existed-999

# a route whose server reads params
node sw-sim3.mjs                      && node probe2.mjs http://127.0.0.1:4334/serverthing/never-existed-777

# Cloudflare
./node_modules/.bin/opennextjs-cloudflare build
./node_modules/.bin/opennextjs-cloudflare preview --port 4320
curl -i http://127.0.0.1:4320/thing/never-existed-123
```

`sw-sim*.mjs` are stand-ins for a service worker: they serve precached artifacts for a
route pattern and, with `OFFLINE=1`, fail every other request.

## Measurements

### 1. The shell exists and is id-independent

`next build` with `cacheComponents: true` emits `.next/server/app/thing/[id].html`
(1762 bytes). `prerender-manifest.json` marks it `"routeType": "shell"`,
`"compute": "static"`, `"fallback": "/thing/[id]"`, status 200.

It is **not** in `.next/static` and has no URL of its own. `next start` serves it, byte
for byte, for any concrete URL matching the pattern — verified against
`/thing/never-existed-123` (`Content-Length: 1762`, `x-nextjs-prerender: 1`, `cmp` clean)
and again for a second id.

### 2. On OpenNext/Cloudflare the shell is not an edge asset — and the Worker hangs

`.open-next/assets/` holds only `BUILD_ID` and `_next/static/*`. No HTML at all: not the
shell, not `/`. The shell lives in `.open-next/server-functions/default/` and
`.open-next/cache/<BUILD_ID>/thing/[id].cache`. Every document is served by the Worker.

And the Worker does not serve it. **Every route returns HTTP 500** — `/` included:

```
Error: The Workers runtime canceled this request because it detected that your
Worker's code had hung and would never generate a response.
```

preceded by a warning from Next:

```
Next.js cannot guarantee that Cache Components will run as expected due to the
current runtime's implementation of `setTimeout()`.
```

Controls: bumping `compatibility_date` to 2026-08-01 does not help. Rebuilding the same
app with `cacheComponents: false` gives **200** on the same URL. The hang is caused by
`cacheComponents`, not by the scaffold.

This is a known open upstream defect — opennextjs-cloudflare
[#1225](https://github.com/opennextjs/opennextjs-cloudflare/issues/1225) and
[#1130](https://github.com/opennextjs/opennextjs-cloudflare/issues/1130) are open, and
[PR #1318](https://github.com/opennextjs/opennextjs-cloudflare/pull/1318) ("run Cache
Components staged renders correctly on workerd") is open and unmerged, its authors still
reporting unresolved 1-byte responses. Next's staged-render scheduler depends on Node
timer internals that workerd does not have.
[#1223](https://github.com/opennextjs/opennextjs-cloudflare/issues/1223), the RSC-prefetch
500 named in the ticket, is **closed** — a different, already-fixed fault.

### 3. The shell alone is not enough off grid

Serving only the precached shell document for `/thing/made-offgrid-abc`, with no network:

```json
{ "fallbackStillThere": true, "useParamsId": null,
  "errors": ["Failed to fetch", "Minified React error #412"] }
```

The shell is a **postponed** render. On hydration the client issues
`GET /thing/<id>?_rsc=... ` with `Next-Router-Segment-Prefetch: /_full` to resume it.
Off grid that request fails and the Suspense fallback stays forever. The client component
never mounts, so `useParams()` never runs.

### 4. The resume payload is also id-independent — and then it works

The `/_full` response is **4237 bytes, byte-identical for `aaa-111` and `bbb-222`, and
contains neither id** (`x-nextjs-postponed: 2`).

With both artifacts precached — the shell document and one `/_full` payload, each fetched
once from an arbitrary concrete URL — and **every** other request failing:

```json
{ "fallbackStillThere": false,
  "useParamsId": "useParams id: never-ever-existed-999",
  "locationPath": "window.location.pathname: /thing/never-ever-existed-999",
  "errors": [] }
```

Two cached files per route pattern render any id, including one that never existed, with
no server. `useParams()` returns the real id from the URL.

### 5. The rule this depends on: no server may read `params`

`cacheComponents: true` **fails the build** when a route reads `params` outside `<Suspense>`:

```
Error: Route "/serverthing/[id]": Next.js encountered uncached or runtime data during
prerendering. `fetch(...)`, `cookies()`, `headers()`, `params`, `searchParams`, or
`connection()` accessed outside of <Suspense> prevents the route from being prerendered
```

Wrapping the params read in `<Suspense>` builds, but off grid that route is stuck:

```json
{ "serverFallbackStillThere": true, "serverId": null,
  "body": "server thing SERVER SHELL FALLBACK" }
```

The `/_full` payload carries the static shell only; the server half never arrives. So the
build enforces the rule for the unwrapped case, and the wrapped case fails silently at run
time instead. Any content a signed-in page must show off grid has to sit in client
components below the boundary.

### 6. RSC prefetch, on Node

The legacy full prefetch (`?_rsc=` with `Next-Router-Prefetch: 1`, no segment header)
returns **404 with an empty body** — `prefetchDataRoute` is `null` in the manifest, because
Next 16 uses segment prefetches instead. Segment prefetches (`/_tree`, `/_full`,
`/thing/$d$id/__PAGE__`) all return 200. No 500 seen on Node. On Cloudflare this could not
be measured: the Worker hangs before any of it.

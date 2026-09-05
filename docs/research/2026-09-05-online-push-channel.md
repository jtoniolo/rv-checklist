# The online push channel from NestJS to the PWA

Date: 2026-09-05

Issue: [#176](https://github.com/jtoniolo/rv-checklist/issues/176), part of
map [#174](https://github.com/jtoniolo/rv-checklist/issues/174).

## The question

Which channel tells an open, online device that another device changed a
record? The charter requires the redraw without a user action. The candidates
are NestJS server-sent events (SSE), a NestJS WebSocket gateway, and PowerSync
sync streams.

## The deployment facts

- The API is NestJS 11 on Node 25 today. Node 25 reached end of life on
  2026-06-01 ([Node.js release schedule](https://github.com/nodejs/Release)).
- The web tier and the API run as containers in k3s behind one Cloudflare
  Tunnel ([ADR-0031](../adr/0031-web-tier-to-k3s-container.md)).
- The API is a subdomain of the web host. The tokens are httpOnly cookies with
  `Domain=.rv.<apex>` and `SameSite=Lax`. The API has a CORS origin allowlist
  ([ADR-0019](../adr/0019-cookie-token-transport.md)).
- All devices are Android. The application is an installed Chrome PWA (#174).

## Candidate 1: NestJS server-sent events

### NestJS support

- NestJS 11 and 12 give the `@Sse()` decorator. The handler returns an
  `Observable<MessageEvent>`. `MessageEvent` has `data`, and optional `id`,
  `type`, and `retry` fields
  ([NestJS: Server-Sent Events](https://docs.nestjs.com/techniques/server-sent-events)).
- When the client closes the connection, NestJS unsubscribes from the
  Observable. `finalize` runs the teardown
  ([NestJS: Server-Sent Events](https://docs.nestjs.com/techniques/server-sent-events)).
- `@SseSignal()` injects an `AbortSignal` for async handlers. The docs say it
  "works identically on both the Express and Fastify platforms"
  ([NestJS: Server-Sent Events](https://docs.nestjs.com/techniques/server-sent-events)).
- The handler reads `Last-Event-ID` with `@Headers('last-event-id')`.
  `@Headers(name)` maps to `req.headers[name]`
  ([NestJS: Controllers](https://docs.nestjs.com/controllers)).
- The NestJS 12 migration guide has no SSE change
  ([NestJS: Migration guide](https://docs.nestjs.com/migration-guide)). The
  v12.0.0 release notes have no SSE line. They add "Express graceful shutdown —
  the Express adapter drains in-flight requests on shutdown"
  ([nestjs/nest v12.0.0](https://github.com/nestjs/nest/releases/tag/v12.0.0)).
  An open SSE response is an in-flight request. The shutdown code must complete
  the SSE Observables.
- The 11.x line fixed SSE defects: "@sse losing events on complete" (v11.1.20)
  and "teardown of SSE producer Observable on client disconnect with
  interceptor" (v11.1.28)
  ([nestjs/nest v11.1.20](https://github.com/nestjs/nest/releases/tag/v11.1.20),
  [nestjs/nest v11.1.28](https://github.com/nestjs/nest/releases/tag/v11.1.28)).

### Through the Cloudflare Tunnel, cross-origin, with cookies

- "Proxied traffic through Cloudflare Tunnel is buffered by default unless the
  origin server includes the `Content-Type: text/event-stream` response header.
  This header tells `cloudflared` to stream data as it arrives instead of
  buffering the entire response"
  ([Cloudflare Tunnel: Common errors](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/troubleshoot-tunnels/common-errors/)).
  NestJS `@Sse()` sets this header.
- The Cloudflare proxy has a Proxy Read Timeout of 125 seconds by default. A
  524 occurs when the origin "does not send a timely response (within the Proxy
  Read Timeout delay, 125 seconds by default)". Only Enterprise zones can change
  it
  ([Cloudflare: Error 524](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-524/),
  [Cloudflare: Connection limits](https://developers.cloudflare.com/fundamentals/reference/connection-limits/)).
  The docs do not say if a streaming response resets this timer on each write.
  The API must send a comment line (`: ping`) at an interval shorter than 125
  seconds. Then no read waits that long.
- `EventSource` is a normal `fetch` request. `withCredentials: true` sets the
  credentials mode to `include`, so the browser sends the cookies
  ([WHATWG HTML: Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)).
  CORS applies. The API must answer with the exact origin and
  `Access-Control-Allow-Credentials: true`. The CORS allowlist of ADR-0019
  already does this for the REST routes.
- The request is a GET from `rv.<apex>` to `api.rv.<apex>`. That is same-site.
  `SameSite=Lax` cookies go with it.
- HTTP/1.1 limits a browser to 6 open connections per domain. HTTP/2 negotiates
  up to 100 streams by default
  ([MDN: EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)).
  Cloudflare enables HTTP/2 to the browser by default on all plans
  ([Cloudflare: HTTP/2](https://developers.cloudflare.com/speed/optimization/protocol/http2/)).
  Thus the 6-connection limit does not apply on the deployed hostname.

### Reconnect and catch-up

- The browser reconnects by itself: "Clients will reconnect if the connection is
  closed; a client can be told to stop reconnecting using the HTTP 204 No
  Content response code"
  ([WHATWG HTML: Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)).
- The `retry` field sets the reconnection time. The default is "probably in the
  region of a few seconds"
  ([WHATWG HTML: Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)).
- On reconnect the browser sends the `Last-Event-ID` header with the `id` of
  the last event it received. If the last id is empty, it sends no header
  ([WHATWG HTML: Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)).
- The browser stops for good on a non-200 status or a wrong `Content-Type`:
  "Once the user agent has failed the connection, it does not attempt to
  reconnect"
  ([WHATWG HTML: Server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html)).
  A 401 after the access cookie expires is a permanent failure. The client must
  make a new `EventSource` after the proxy refreshes the cookie.
- The client writes no reconnect code. The API sets `id` to the sync cursor.
  On reconnect the API reads `Last-Event-ID` and replays the changes after that
  cursor from the same "changes since a cursor" read that the initial sync uses.

### Android Chrome PWA, screen off and background

- Chrome suspends the page tasks when it freezes the page: "Things like
  JavaScript timers and fetch callbacks don't run". The freeze guidance says to
  "stop any network polling or close any open Web Socket connections". Discard
  ends all script. `document.wasDiscarded` shows a discard at the next load
  ([Chrome: Page Lifecycle API](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)).
- "In mobile Chrome, tabs that have been in background for (at least) 5
  minutes, may be frozen, to conserve battery and data"
  ([WICG: Page Lifecycle](https://wicg.github.io/page-lifecycle/)).
- Android Doze "Suspends network access" when the device is unplugged, still,
  and the screen is off. Maintenance windows give network access for a short
  time, and less often over time. App Standby gives an idle app network access
  "about once a day"
  ([Android: Doze and App Standby](https://developer.android.com/training/monitoring-device-state/doze-standby)).
- Result for SSE: with the screen off or the app in the background, the stream
  stops. On resume, `EventSource` reconnects by itself and sends
  `Last-Event-ID`. The API replays the missed changes. The client adds one
  `resume` and `visibilitychange` handler that makes a new `EventSource` if the
  old one is closed.

### Node 26

- Node 26.0.0 was released on 2026-05-05. Active LTS starts on 2026-10-28
  ([Node.js release schedule](https://github.com/nodejs/Release)).
- Node 26 removes `http.Server.prototype.writeHeader()` and the legacy
  `_stream_*` modules. It fixes "handling of HTTP upgrades with bodies"
  ([Node.js 26.0.0](https://nodejs.org/en/blog/release/v26.0.0)). SSE uses
  `writeHead` and a normal response stream. Nothing in the release notes
  touches it.
- NestJS 12 runs on "v20.19+, or v22.12+ on the 22.x line". The CLI needs
  "v22.22.3+, v24.15+, or v26+"
  ([NestJS: Migration guide](https://docs.nestjs.com/migration-guide)).
  Node 26 satisfies both.
- SSE needs no extra package. Only `@nestjs/common` and Express.

## Candidate 2: NestJS WebSocket gateway

### NestJS support

- NestJS gives `@WebSocketGateway()` with two platforms out of the box:
  socket.io (`@nestjs/platform-socket.io`) and ws (`@nestjs/platform-ws`). The
  lifecycle hooks are `afterInit`, `handleConnection`, and `handleDisconnect`
  ([NestJS: Gateways](https://docs.nestjs.com/websockets/gateways)).
- The ws adapter is "fully compatible with native browser WebSockets" and has
  no namespaces
  ([NestJS: Adapters](https://docs.nestjs.com/websockets/adapter)).
- NestJS 12 changes: "Request-scoped WebSocket gateways — gateways support
  request-scoped providers, with the socket injectable via the `REQUEST`
  token" and "WebSocket disconnect reason — `handleDisconnect` can receive the
  reason for the disconnection"
  ([nestjs/nest v12.0.0](https://github.com/nestjs/nest/releases/tag/v12.0.0),
  [NestJS: Migration guide](https://docs.nestjs.com/migration-guide)).
- The gateway docs do not cover authentication, cookies, or reconnection
  ([NestJS: Gateways](https://docs.nestjs.com/websockets/gateways)).

### Through the Cloudflare Tunnel, cross-origin, with cookies

- "Cloudflare Tunnel has full support for Websockets"
  ([Cloudflare Tunnels FAQ](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/)).
  WebSockets are on all plans. The zone setting must be on
  ([Cloudflare: WebSockets](https://developers.cloudflare.com/network/websockets/)).
- "Cloudflare will close a WebSocket connection when no data is transmitted in
  either direction for a period of time." The docs give no number. Only
  Enterprise can change it. "When Cloudflare releases new code to its global
  network, we may restart servers, which terminates WebSockets connections."
  Cloudflare recommends "a client-side heartbeat (ping/pong) mechanism"
  ([Cloudflare: WebSockets](https://developers.cloudflare.com/network/websockets/)).
- The browser opens a WebSocket with a fetch request whose "credentials mode is
  `include`". CORS does not apply. The browser sends an `Origin` header
  ([WHATWG WebSockets](https://websockets.spec.whatwg.org/)). The cookies go
  with the handshake. The gateway must check the `Origin` header itself.
  Nothing else protects the handshake.
- socket.io starts with HTTP long-polling and then upgrades. The default
  transports are `["polling", "websocket", "webtransport"]`. `withCredentials`
  is `false` by default. The server needs `cors: { origin: [...], credentials:
  true }`, and `origin: *` is not allowed with credentials
  ([socket.io: Client options](https://socket.io/docs/v4/client-options/),
  [socket.io: Handling CORS](https://socket.io/docs/v4/handling-cors/)).

### Reconnect and catch-up

- Raw WebSocket: "The WebSocket object does not automatically reconnect after
  closing." The client must make a new WebSocket. The `CloseEvent` gives
  `wasClean`, `code`, and `reason`
  ([WHATWG WebSockets](https://websockets.spec.whatwg.org/)). The client must
  write the backoff loop, the heartbeat, the cursor store, and the catch-up
  request.
- socket.io reconnects by default: `reconnectionAttempts: Infinity`,
  `reconnectionDelay: 1000`, `reconnectionDelayMax: 5000`,
  `randomizationFactor: 0.5`
  ([socket.io: Client options](https://socket.io/docs/v4/client-options/)).
- socket.io connection state recovery replays "any missed packets" after a
  short outage. `maxDisconnectionDuration` bounds it. "The recovery will not
  always be successful." When it fails the client must ask for the state again
  ([socket.io: Connection state recovery](https://socket.io/docs/v4/connection-state-recovery)).
  This buffer holds packets, not a durable cursor. A 5-minute freeze or a
  night of Doze exceeds any sane `maxDisconnectionDuration`.
- Result: with either adapter the client still needs the "changes since a
  cursor" read on the API for the catch-up. The channel does not carry the
  cursor for it.

### Android Chrome PWA, screen off and background

- The same freeze and Doze facts as SSE apply. Chrome tells developers to close
  WebSockets on freeze
  ([Chrome: Page Lifecycle API](https://developer.chrome.com/docs/web-platform/page-lifecycle-api)).
- Chrome 133 Energy Saver freezing suspends "Event handlers (for example,
  input, network, and sensor)" on hidden, silent, CPU-intensive tabs after five
  minutes
  ([Chrome: Freezing on Energy Saver](https://developer.chrome.com/blog/freezing-on-energy-saver)).
- Result: the socket dies with the screen off. socket.io reconnects when the
  page resumes. A raw WebSocket client must do it in hand-written code.

### Node 26

- `socket.io` 4.8.3 declares `"node": ">=10.2.0"`
  ([socket.io package.json](https://raw.githubusercontent.com/socketio/socket.io/main/packages/socket.io/package.json)).
  `ws` 8.21.3 declares `"node": ">=10.0.0"`
  ([ws package.json](https://raw.githubusercontent.com/websockets/ws/master/package.json)).
- Node 26 fixes "handling of HTTP upgrades with bodies"
  ([Node.js 26.0.0](https://nodejs.org/en/blog/release/v26.0.0)). A WebSocket
  handshake is an HTTP upgrade. The fix does not change the normal handshake.
- The gateway adds two packages to the API: `@nestjs/websockets` and one
  platform package. The lockfile already resolves `@nestjs/websockets` as an
  optional peer.

## Candidate 3: PowerSync sync streams

### What it is

- Sync Streams: "each client syncs only the relevant subset of data, instead of
  the entire database". The client calls
  `db.syncStream(name, params).subscribe({ ttl })`. PowerSync keeps the data
  "synced in real-time to a client-side SQLite database"
  ([PowerSync: Sync Streams](https://docs.powersync.com/sync/streams)).
- Sync Streams became GA on 2026-05-14. "Sync Rules ... are now considered
  legacy. Sync Rules will be deprecated eventually"
  ([PowerSync: Sync Streams GA](https://releases.powersync.com/announcements/sync-streams-are-now-generally-available)).
  The ten synced tables and the sync-rules test in this repository are on the
  legacy path.
- The protocol: "the stream can be interrupted at any time, at which point the
  client will initiate a new session, resuming from the last point". A
  checkpoint is "a sequential ID that represents a single point-in-time"
  ([PowerSync: Protocol](https://docs.powersync.com/architecture/powersync-protocol)).
- The web SDK default transport is HTTP streaming. WebSocket (RSocket) is the
  alternative
  ([PowerSync: JavaScript Web SDK](https://docs.powersync.com/client-sdk-references/javascript-web)).
  Through the tunnel it has the same buffering and timeout facts as SSE.

### The cost

- One more container: `journeyapps/powersync-service`
  ([PowerSync: Self-hosting](https://docs.powersync.com/self-hosting/getting-started)).
  Its image builds on `node:24.18.1-trixie-slim`
  ([powersync-service Dockerfile](https://raw.githubusercontent.com/powersync-ja/powersync-service/main/service/Dockerfile)).
  The service, not the API, decides the Node version. Node 26 in the API does
  not touch it.
- One more database for bucket storage: MongoDB with a replica set, or Postgres
  14+ on the same server as the source database
  ([PowerSync: Service setup](https://docs.powersync.com/self-hosting/installation/powersync-service-setup)).
  CNPG can host it, but it is a second schema and a second replication setup.
- The service license is `FSL-1.1-ALv2`
  ([powersync-service package.json](https://raw.githubusercontent.com/powersync-ja/powersync-service/main/package.json)).
- A second local store: SQLite in a web worker on `IDBBatchAtomicVFS` by
  default, or OPFS. "Full multi-tab support relies on shared web workers, which
  are disabled by default on Android, iOS, and Safari"
  ([PowerSync: JavaScript Web SDK](https://docs.powersync.com/client-sdk-references/javascript-web)).
  The charter puts all user data in one persisted Redux store. A PowerSync
  store is a second copy. Every change must cross from SQLite into Redux to
  cause the redraw.
- The write side still goes to the API. The charter keeps write authority on
  the API. PowerSync then only carries the read side. A channel plus a "changes
  since a cursor" read on the API needs zero new containers, zero new
  databases, and one persisted store.

### Node 26

- Not applicable to the API. The service pins its own Node in its image.

## Comparison

| Point of the issue | SSE | WebSocket gateway | PowerSync sync streams |
| --- | --- | --- | --- |
| NestJS 11 support | `@Sse()`, in `@nestjs/common` | `@nestjs/websockets` plus one platform | None; a separate service |
| NestJS 12 change | None. Express drains in-flight requests on shutdown | `REQUEST`-scoped gateways; disconnect reason | None |
| Cloudflare Tunnel | Streams when `Content-Type: text/event-stream`. 125 s read timeout; a ping under that keeps it open | Full support. Idle close after an unstated time; server restarts cut it; ping needed | Same as SSE (HTTP streaming) |
| Cross-origin cookies | `withCredentials: true`, CORS with credentials, Lax OK (same-site) | Cookies on handshake; no CORS; gateway must check `Origin` | Token given to the SDK; not a cookie |
| Reconnect | Browser, automatic, `retry` from server | Raw: hand-written. socket.io: automatic | SDK, automatic |
| Catch-up | `Last-Event-ID` from the browser, replay from the API cursor read | Client must send its cursor and call the cursor read | Checkpoint resume inside the SDK |
| Screen off, background | Stream dies; reconnects on resume | Socket dies; socket.io reconnects on resume | Stream dies; SDK reconnects |
| New containers | 0 | 0 | 1 service plus bucket storage |
| New local store | 0 | 0 | 1 SQLite store beside Redux |
| Node 26 | Nothing in the release notes touches it | ws and socket.io support Node 10+ | Own image, Node 24 |
| Extra packages | 0 | 2 | SDK plus service |

## Recommendation

Use NestJS server-sent events. One `@Sse()` route per signed-in user delivers
`{ id: <cursor>, data: <change> }`. The `id` is the sync cursor. The client
opens `new EventSource(url, { withCredentials: true })` and dispatches each
change into the Redux store.

Reasons:

1. The browser owns the reconnect and the catch-up handshake. `EventSource`
   reconnects and sends `Last-Event-ID` by spec. The client writes no reconnect
   loop. The catch-up is the same "changes since a cursor" read that the
   initial sync uses, so the channel and the sync protocol share one cursor.
2. It fits the deployment as it is. It is a GET with cookies from `rv.<apex>` to
   `api.rv.<apex>`. The CORS allowlist and the Lax cookies of ADR-0019 already
   cover it. The tunnel streams it because NestJS sets `text/event-stream`.
3. It adds nothing. No package, no container, no database, no second store.
   PowerSync adds one service, one bucket database, and one SQLite store that
   duplicates the Redux store. That is not a significant technical advantage,
   so the charter bins it.
4. It survives both migrations. NestJS 12 changes nothing in SSE. Node 26
   changes nothing that SSE uses.
5. WebSocket gains nothing here. The channel is one-way. The write side stays
   on REST. WebSocket costs a handshake `Origin` check, a heartbeat, and a
   hand-written or socket.io reconnect, and it still needs the cursor read.

Constraints that the build tickets must carry:

- The API sends a comment line at least every 60 seconds. This stays under the
  125-second Cloudflare read timeout.
- The API sets `id` on every event. An event without `id` leaves the browser
  cursor as it was.
- The API replies 204 to tell a client to stop. It never replies a non-200 for
  a transient fault, because that stops the reconnect for good.
- The client makes a new `EventSource` on `resume`, on `visibilitychange` to
  visible, and after a 401. The proxy refreshes the access cookie before the
  new request.
- The shutdown hook completes every open SSE Observable, so the NestJS 12
  Express drain does not wait on them.
- On the first open after a freeze, discard, or Doze, the client runs the
  cursor read once, then opens the stream. This covers a lost `Last-Event-ID`
  after a discard.

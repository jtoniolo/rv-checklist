/**
 * The service worker's behaviour (ADR-0028, issue #150), exercised against the
 * worker itself rather than against a description of it.
 *
 * There is no browser in this repo — no Playwright, no Cypress — and the
 * acceptance criteria for a service worker are all behavioural: network-first
 * while online, cached pages when the network fails, a fallback page for a
 * route that was never visited. So this suite compiles `sw/index.ts` exactly
 * the way `sw/build.mjs` does, runs the result against a fake
 * `ServiceWorkerGlobalScope` — a Cache Storage that is a `Map`, a network that
 * can be switched off — and dispatches real `install`, `activate` and `fetch`
 * events at it.
 *
 * What that does and does not prove: it proves the routing, the strategies and
 * the fallback wiring, which is where this kind of worker goes wrong. It does
 * not prove the browser's own half — that a navigation really arrives with
 * `mode: 'navigate'`, or that the update check re-fetches `/sw.js` — and those
 * stay a hand check against a deployment.
 *
 * Runs outside jsdom: nothing here touches the DOM, and esbuild refuses to run
 * inside jsdom's realm, where `TextEncoder` and `Uint8Array` belong to
 * different globals.
 *
 * @jest-environment node
 */
// Serwist's expiration bookkeeping lives in IndexedDB, and it is awaited on
// the cache-write path, so the harness needs a real one. Imported here rather
// than in `test-setup.ts` on purpose: the rest of the suite relies on there
// being no IndexedDB (ADR-0029 — a host without one has no local store).
import 'fake-indexeddb/auto';
import path from 'node:path';
import { buildSync } from 'esbuild';

const ORIGIN = 'https://app.test';
const BUILD_ID = 'test-build-id';
const SDK_VERSION = '9.9.9';

/**
 * The same shape `sw/build.mjs` injects, trimmed to one entry of each kind.
 * A content-hashed filename carries no revision, and Serwist spells that
 * `null` — `undefined` means "revision unknown", which it warns about.
 */
const MANIFEST = [
  { url: '/offline', revision: BUILD_ID },
  { url: '/@powersync/worker.js', revision: SDK_VERSION },
  // eslint-disable-next-line unicorn/no-null
  { url: '/_next/static/chunks/app.css', revision: null },
];

function compileWorker(): string {
  const result = buildSync({
    entryPoints: [path.join(__dirname, '..', 'sw', 'index.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    write: false,
    define: {
      'process.env.NODE_ENV': '"production"',
      'self.__SW_MANIFEST': JSON.stringify(MANIFEST),
    },
  });
  const output = result.outputFiles[0];
  if (!output) throw new Error('esbuild produced no output');
  return output.text;
}

function keyOf(request: Request | string): string {
  return typeof request === 'string' ? request : request.url;
}

/** Cache Storage as a `Map`. Enough of the API for the strategies to run. */
class FakeCache {
  readonly entries = new Map<string, Response>();

  match(request: Request | string): Promise<Response | undefined> {
    return Promise.resolve(this.entries.get(keyOf(request))?.clone());
  }

  put(request: Request | string, response: Response): Promise<void> {
    this.entries.set(keyOf(request), response);
    return Promise.resolve();
  }

  keys(): Promise<Request[]> {
    return Promise.resolve(
      this.entries
        .keys()
        .map((url) => new Request(url))
        .toArray(),
    );
  }

  delete(request: Request | string): Promise<boolean> {
    return Promise.resolve(this.entries.delete(keyOf(request)));
  }
}

class FakeCacheStorage {
  readonly caches = new Map<string, FakeCache>();

  open(name: string): Promise<FakeCache> {
    let cache = this.caches.get(name);
    if (!cache) {
      cache = new FakeCache();
      this.caches.set(name, cache);
    }
    return Promise.resolve(cache);
  }

  keys(): Promise<string[]> {
    return Promise.resolve(this.caches.keys().toArray());
  }

  delete(name: string): Promise<boolean> {
    return Promise.resolve(this.caches.delete(name));
  }

  has(name: string): Promise<boolean> {
    return Promise.resolve(this.caches.has(name));
  }

  async match(
    request: Request | string,
    options?: { cacheName?: string },
  ): Promise<Response | undefined> {
    const names = options?.cacheName
      ? [options.cacheName]
      : this.caches.keys().toArray();
    for (const name of names) {
      const hit = await this.caches.get(name)?.match(request);
      if (hit) return hit;
    }
    return undefined;
  }

  /** Every stored URL, across every cache — how the assertions look inside. */
  urls(): string[] {
    return this.caches
      .values()
      .flatMap((cache) => cache.entries.keys())
      .toArray();
  }
}

/** Work handed to `waitUntil`, or returned by a lifecycle handler. */
async function swallow(promise: Promise<unknown>): Promise<void> {
  try {
    await promise;
  } catch {
    // A failed install or a failed cache write is something the browser
    // records and retries, not something that should fail the run.
  }
}

/** A network that answers a fixed set of paths, and can be switched off. */
class FakeNetwork {
  private readonly responders = new Map<string, () => Response>();
  online = true;
  readonly attempts: string[] = [];

  readonly fetch = (input: Request | string): Promise<Response> => {
    const url = new URL(keyOf(input));
    this.attempts.push(url.pathname);
    if (!this.online) {
      return Promise.reject(new TypeError('Failed to fetch'));
    }
    const responder = this.responders.get(url.pathname);
    return Promise.resolve(
      responder ? responder() : new Response('not found', { status: 404 }),
    );
  };

  serve(pathname: string, responder: () => Response): void {
    this.responders.set(pathname, responder);
  }
}

class FakeExtendableEvent {
  private readonly pending: Promise<unknown>[] = [];
  readonly type: string;

  constructor(type: string) {
    this.type = type;
  }

  waitUntil(promise: Promise<unknown>): void {
    this.pending.push(swallow(promise));
  }

  async settled(): Promise<void> {
    while (this.pending.length > 0) {
      const batch = [...this.pending];
      this.pending.length = 0;
      await Promise.all(batch);
    }
  }
}

class FakeFetchEvent extends FakeExtendableEvent {
  readonly request: Request;
  response: Promise<Response> | undefined;

  constructor(request: Request) {
    super('fetch');
    this.request = request;
  }

  respondWith(response: Promise<Response>): void {
    this.response = response;
  }
}

type Listener = (event: FakeExtendableEvent) => unknown;

interface Worker {
  readonly network: FakeNetwork;
  readonly storage: FakeCacheStorage;
  install(): Promise<void>;
  activate(): Promise<void>;
  handle(request: Request): Promise<Response | undefined>;
}

const workerSource = compileWorker();

function boot(): Worker {
  const network = new FakeNetwork();
  const storage = new FakeCacheStorage();
  const listeners = new Map<string, Listener[]>();
  const location = { href: `${ORIGIN}/`, origin: ORIGIN };

  const scope = {
    addEventListener(type: string, listener: Listener): void {
      const forType = listeners.get(type) ?? [];
      forType.push(listener);
      listeners.set(type, forType);
    },
    removeEventListener(): void {
      // Nothing under test removes a listener.
    },
    skipWaiting: (): Promise<void> => Promise.resolve(),
    clients: { claim: (): Promise<void> => Promise.resolve() },
    registration: { scope: `${ORIGIN}/` },
    caches: storage,
    location,
  };

  // The compiled worker is an IIFE that reads `self`, `caches`, `fetch`,
  // `location` and `FetchEvent` as free identifiers, so naming them as
  // parameters is all the sandbox this needs.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const run = new Function(
    'self',
    'caches',
    'fetch',
    'location',
    'FetchEvent',
    workerSource,
  ) as (
    self: unknown,
    caches: unknown,
    fetch: unknown,
    location: unknown,
    fetchEvent: unknown,
  ) => void;
  run(scope, storage, network.fetch, location, FakeFetchEvent);

  const listenersFor = (type: string): Listener[] => listeners.get(type) ?? [];

  const dispatch = async (type: string): Promise<void> => {
    const event = new FakeExtendableEvent(type);
    const settling: Promise<unknown>[] = [];
    for (const listener of listenersFor(type)) {
      // A lifecycle handler both passes its work to `waitUntil` and returns
      // it. The returned copy needs swallowing too, or a failure the browser
      // would simply record as a failed install becomes an unhandled rejection
      // that fails the run.
      const returned: unknown = listener(event);
      if (returned instanceof Promise) settling.push(swallow(returned));
    }
    await Promise.all(settling);
    await event.settled();
  };

  return {
    network,
    storage,
    install: () => dispatch('install'),
    activate: () => dispatch('activate'),
    handle: async (request) => {
      const event = new FakeFetchEvent(request);
      for (const listener of listenersFor('fetch')) listener(event);
      const response = event.response ? await event.response : undefined;
      await event.settled();
      return response;
    },
  };
}

/**
 * A document navigation. `mode` and `destination` are read-only on a `Request`
 * and cannot be set through `RequestInit` — the browser sets them — so they are
 * defined onto the instance.
 */
function navigation(pathname: string): Request {
  const request = new Request(`${ORIGIN}${pathname}`);
  Object.defineProperties(request, {
    mode: { value: 'navigate' },
    destination: { value: 'document' },
  });
  return request;
}

/** An App Router payload request, as `fetchServerResponse` builds one. */
function routerPayload(pathname: string, cacheBuster: string): Request {
  return new Request(`${ORIGIN}${pathname}?_rsc=${cacheBuster}`, {
    headers: { rsc: '1', 'next-router-state-tree': '%5B%22%22%5D' },
  });
}

function script(pathname: string): Request {
  const request = new Request(`${ORIGIN}${pathname}`);
  Object.defineProperty(request, 'destination', { value: 'script' });
  return request;
}

function html(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html' },
  });
}

async function bodyOf(response: Response | undefined): Promise<string> {
  if (!response) throw new Error('the worker returned no response');
  return await response.text();
}

/** A worker whose network answers the manifest, installed and activated. */
async function warmedWorker(): Promise<Worker> {
  const worker = boot();
  worker.network.serve('/offline', () => html('<h1>You are offline</h1>'));
  worker.network.serve('/@powersync/worker.js', () => new Response('worker()'));
  worker.network.serve(
    '/_next/static/chunks/app.css',
    () => new Response('body{}'),
  );
  worker.network.serve('/rigs', () => html('<h1>Your rigs</h1>'));
  worker.network.serve(
    '/_next/static/chunks/page.js',
    () => new Response('chunk()'),
  );
  await worker.install();
  await worker.activate();
  return worker;
}

describe('service worker', () => {
  describe('install', () => {
    it('precaches the fallback page, the PowerSync assets and the stylesheet', async () => {
      const worker = await warmedWorker();

      expect(worker.network.attempts).toEqual(
        expect.arrayContaining([
          '/offline',
          '/@powersync/worker.js',
          '/_next/static/chunks/app.css',
        ]),
      );
      expect(worker.storage.urls()).toEqual(
        expect.arrayContaining([
          `${ORIGIN}/offline?__WB_REVISION__=${BUILD_ID}`,
          `${ORIGIN}/@powersync/worker.js?__WB_REVISION__=${SDK_VERSION}`,
          `${ORIGIN}/_next/static/chunks/app.css`,
        ]),
      );
    });
  });

  describe('navigations are network-first', () => {
    it('answers from the network and keeps a copy', async () => {
      const worker = await warmedWorker();

      const response = await worker.handle(navigation('/rigs'));

      expect(await bodyOf(response)).toBe('<h1>Your rigs</h1>');
      expect(worker.network.attempts).toContain('/rigs');
      expect(worker.storage.urls()).toContain(`${ORIGIN}/rigs`);
    });

    it('prefers a fresh response over the copy it already has', async () => {
      const worker = await warmedWorker();
      await worker.handle(navigation('/rigs'));
      worker.network.serve('/rigs', () => html('<h1>Renamed</h1>'));

      const response = await worker.handle(navigation('/rigs'));

      expect(await bodyOf(response)).toBe('<h1>Renamed</h1>');
    });

    it('passes a redirect straight through and never stores it as the page', async () => {
      const worker = await warmedWorker();
      worker.network.serve(
        '/rig/redirected',
        () =>
          new Response('', { status: 307, headers: { location: '/welcome' } }),
      );

      const response = await worker.handle(navigation('/rig/redirected'));

      expect(response?.status).toBe(307);
      expect(worker.storage.urls()).not.toContain(`${ORIGIN}/rig/redirected`);
    });
  });

  describe('offline', () => {
    it('serves a visited page from the cache, after trying the network', async () => {
      const worker = await warmedWorker();
      await worker.handle(navigation('/rigs'));
      worker.network.online = false;
      const attemptsBefore = worker.network.attempts.length;

      const response = await worker.handle(navigation('/rigs'));

      expect(await bodyOf(response)).toBe('<h1>Your rigs</h1>');
      expect(worker.network.attempts.length).toBeGreaterThan(attemptsBefore);
    });

    it('answers a route the device has never visited with the fallback page', async () => {
      const worker = await warmedWorker();
      worker.network.online = false;

      const response = await worker.handle(navigation('/rig/r1/settings'));

      expect(await bodyOf(response)).toBe('<h1>You are offline</h1>');
    });

    it('serves the PowerSync worker from the precache, without a network call', async () => {
      const worker = await warmedWorker();
      worker.network.online = false;
      const attemptsBefore = worker.network.attempts.length;

      const response = await worker.handle(
        new Request(`${ORIGIN}/@powersync/worker.js`),
      );

      expect(await bodyOf(response)).toBe('worker()');
      expect(worker.network.attempts).toHaveLength(attemptsBefore);
    });

    it('replays a router payload it has already seen', async () => {
      const worker = await warmedWorker();
      worker.network.serve('/rig/r1/trips', () => new Response('1:["flight"]'));
      await worker.handle(routerPayload('/rig/r1/trips', 'abc123'));
      worker.network.online = false;

      const response = await worker.handle(
        routerPayload('/rig/r1/trips', 'abc123'),
      );

      expect(await bodyOf(response)).toBe('1:["flight"]');
    });

    it('does not answer a failed script with the fallback page', async () => {
      const worker = await warmedWorker();
      worker.network.online = false;

      await expect(
        worker.handle(script('/_next/static/chunks/never-fetched.js')),
      ).rejects.toBeDefined();
    });
  });

  describe('build assets are cache-first', () => {
    it('serves a second request for a chunk without touching the network', async () => {
      const worker = await warmedWorker();
      await worker.handle(script('/_next/static/chunks/page.js'));
      const attemptsBefore = worker.network.attempts.length;

      const response = await worker.handle(
        script('/_next/static/chunks/page.js'),
      );

      expect(await bodyOf(response)).toBe('chunk()');
      expect(worker.network.attempts).toHaveLength(attemptsBefore);
    });
  });
});

import { Blob, File } from 'node:buffer';
import {
  ReadableStream,
  TransformStream,
  WritableStream,
} from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';
import { BroadcastChannel, MessagePort } from 'node:worker_threads';

// Give the RTK Query base query an absolute base URL so `fetchBaseQuery` can
// build a valid `Request` under jsdom (a relative URL throws). Runs before the
// modules under test are imported, so the app and data-access `config.ts` read
// it. In the browser (this jsdom env) that config reads `window.__PUBLIC_CONFIG__`
// (ADR-0020), the object the root layout writes at runtime; the process env
// value covers any server-side (`process.env`) read the same suites make.
Object.assign(globalThis, {
  __PUBLIC_CONFIG__: {
    PUBLIC_API_BASE_URL: 'https://api.test',
    GOOGLE_CLIENT_ID: 'test-google-client-id',
  },
});
Object.assign(process.env, { PUBLIC_API_BASE_URL: 'https://api.test' });

// jsdom ships no fetch API; specs that exercise RTK Query need the real
// constructors (`fetchBaseQuery` builds `Request`s, mocks build `Response`s),
// so borrow undici's — the same implementation Node's global fetch uses. The
// encoder globals must land before undici loads (hence `require`, which does
// not hoist above the assignment the way an `import` would).
Object.assign(globalThis, {
  TextDecoder,
  TextEncoder,
  ReadableStream,
  TransformStream,
  WritableStream,
  Blob,
  // Node's File must displace jsdom's before undici loads: undici's webidl
  // captures the global `File` at load time, so a jsdom File appended to a
  // FormData fails the brand check and serializes as an empty part. With
  // Node's File in place, specs can build files, `fetchBaseQuery` can
  // serialize multipart bodies, and mocks can parse them back.
  File,
  // undici's webidl layer references the MessagePort type at load. The
  // MessageChannel constructor itself deliberately stays off the global:
  // React's scheduler would grab it, and a worker_threads port with a
  // 'message' listener is a ref'd handle the scheduler never closes, so Jest
  // (in-band, as in CI) could never exit and the job would hang until the
  // timeout. Without a global MessageChannel the scheduler falls back to
  // setTimeout, which leaks nothing.
  MessagePort,
  // jsdom ships no `BroadcastChannel` at all — the offline attachment outbox
  // (issue #152) uses it to tell any open tab a queued capture changed.
  // Unlike `MessageChannel` above, this one has no open 'message' listener
  // by default (a spec opens and closes its own), so it carries none of that
  // risk.
  BroadcastChannel,
});
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { FormData, Headers, Request, Response } = require('undici') as {
  FormData: unknown;
  Headers: unknown;
  Request: unknown;
  Response: unknown;
};
// `fetch` itself always rejects: no spec may touch the network. Suites that
// exercise the API spy on this property and route requests to canned data; a
// late call that lands after a spy is restored fails fast instead of dialling
// out (fetchBaseQuery turns the rejection into a query error).
const noNetwork = (): Promise<never> =>
  Promise.reject(new Error('No network in tests — mock fetch.'));
Object.assign(globalThis, {
  fetch: noNetwork,
  FormData,
  Headers,
  Request,
  Response,
});

// jsdom has no ResizeObserver; the Radix-based shadcn controls (Checkbox, etc.)
// observe their size on mount, so provide a no-op stub for the component specs.
class ResizeObserverStub {
  observe(): void {
    // no-op
  }
  unobserve(): void {
    // no-op
  }
  disconnect(): void {
    // no-op
  }
}
Object.assign(globalThis, { ResizeObserver: ResizeObserverStub });

// jsdom implements `navigator.onLine` as a prototype getter hard-wired to
// `true`, so the offline-indicator specs (issue #153) cannot flip it. Shadow it
// with a writable own property, still defaulting to online; a spec assigns to
// it and dispatches the matching `online`/`offline` event, the way a browser
// does, and restores it afterwards.
Object.defineProperty(globalThis.navigator, 'onLine', {
  configurable: true,
  writable: true,
  value: true,
});

// jsdom's realm has no `structuredClone` — the outbox specs (issue #152,
// `apps/web/sw/outbox-*.spec.ts`) exercise `fake-indexeddb`, which clones the
// stored value on every `put`. Good enough for the flat, one-Blob-field
// records the outbox deals in; not a general-purpose structured clone.
function structuredCloneForTests<T>(value: T): T {
  if (value instanceof Blob) return value.slice(0, value.size, value.type) as T;
  if (Array.isArray(value)) {
    return value.map((item: unknown) => structuredCloneForTests(item)) as T;
  }
  if (value !== null && typeof value === 'object') {
    const clone: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      clone[key] =
        entryValue instanceof Blob
          ? entryValue.slice(0, entryValue.size, entryValue.type)
          : entryValue;
    }
    return clone as T;
  }
  return value;
}
if (typeof structuredClone === 'undefined') {
  Object.assign(globalThis, { structuredClone: structuredCloneForTests });
}

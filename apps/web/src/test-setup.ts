import { Blob, File } from 'node:buffer';
import {
  ReadableStream,
  TransformStream,
  WritableStream,
} from 'node:stream/web';
import { TextDecoder, TextEncoder } from 'node:util';
import { MessagePort } from 'node:worker_threads';

// Give the RTK Query base query an absolute base URL so `fetchBaseQuery` can
// build a valid `Request` under jsdom (a relative URL throws). Runs before the
// modules under test are imported, so the data-access `config.ts` reads it.
Object.assign(process.env, { NEXT_PUBLIC_API_BASE_URL: 'https://api.test' });

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

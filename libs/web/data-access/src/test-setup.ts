import { BroadcastChannel as NodeBroadcastChannel } from 'node:worker_threads';

// Give the RTK Query base query an absolute base URL so `fetchBaseQuery` can
// build a valid `Request` under jsdom/node (a relative URL throws). Runs before
// the modules under test are imported, so `config.ts` reads it.
process.env['NEXT_PUBLIC_API_BASE_URL'] = 'https://api.test';

// The outbox specs (issue #152) opt into `@jest-environment jsdom` for
// `@testing-library/react`'s `renderHook`; jsdom's sandboxed realm has
// neither of these even though the surrounding Node process does. Real
// `BroadcastChannel` from Node's own runtime; a `structuredClone` good
// enough for the flat, one-Blob-field outbox records `fake-indexeddb` clones
// on every `put` (no-op under the lib's default node environment, which
// already has both natively).
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

if (typeof BroadcastChannel === 'undefined') {
  Object.assign(globalThis, { BroadcastChannel: NodeBroadcastChannel });
}
if (typeof structuredClone === 'undefined') {
  Object.assign(globalThis, { structuredClone: structuredCloneForTests });
}

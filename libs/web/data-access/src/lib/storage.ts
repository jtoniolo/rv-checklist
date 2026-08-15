/**
 * SSR-safe access to the browser's localStorage, shared by the persistence
 * modules (`preferences.storage.ts`).
 */

/** The browser's localStorage, or `undefined` on the server / non-DOM contexts. */
export function storage(): Storage | undefined {
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    if (candidate && typeof candidate.getItem === 'function') {
      return candidate;
    }
  } catch {
    // Accessing localStorage can throw (disabled, or an unconfigured stub) —
    // treat that the same as "no persistence available".
  }
  return undefined;
}

/** Mirror a single optional value to a key (removing it when `undefined`). */
export function setOrRemove(
  store: Storage,
  key: string,
  value: string | undefined,
): void {
  if (value === undefined) {
    store.removeItem(key);
  } else {
    store.setItem(key, value);
  }
}

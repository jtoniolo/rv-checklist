import type { AuthState } from './auth.slice.js';

/**
 * localStorage persistence for the session (ADR-0002: the token pair lives in
 * the browser so it can call the API directly). This is *only* persistence — the
 * auth slice is the runtime source of truth. The store hydrates its
 * `preloadedState` from here on boot and mirrors it back on every change, so a
 * silent refresh that rotates the tokens survives a reload. SSR-safe: with no
 * `localStorage` (the server) it reads empty and writes nothing.
 */
const ACCESS_KEY = 'rv.accessToken';
const REFRESH_KEY = 'rv.refreshToken';

/** The browser's localStorage, or `undefined` on the server / non-DOM contexts. */
function storage(): Storage | undefined {
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

/** The persisted session, or an empty session when none / not in a browser. */
export function loadPersistedAuth(): AuthState {
  const store = storage();
  if (!store) {
    return { accessToken: undefined, refreshToken: undefined };
  }
  return {
    accessToken: store.getItem(ACCESS_KEY) ?? undefined,
    refreshToken: store.getItem(REFRESH_KEY) ?? undefined,
  };
}

/** Mirror the current session to localStorage (clearing keys when signed out). */
export function persistAuth(auth: AuthState): void {
  const store = storage();
  if (!store) {
    return;
  }
  setOrRemove(store, ACCESS_KEY, auth.accessToken);
  setOrRemove(store, REFRESH_KEY, auth.refreshToken);
}

function setOrRemove(
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

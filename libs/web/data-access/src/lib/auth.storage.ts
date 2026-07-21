import type { AuthState } from './auth.slice.js';
import { setOrRemove, storage } from './storage.js';

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

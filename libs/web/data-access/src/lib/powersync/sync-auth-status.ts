/**
 * Whether the sync layer can currently authenticate as this store's own owner
 * (ADR-0028). Background sync runs with no page navigation in the path, so it
 * owns its own token refresh; when that fails, the connector is the only thing
 * that knows why — a dead refresh token, or a sync token minted for someone
 * else (ADR-0029, decision 10) — and this module is the seam it reports
 * through. The "sign in to sync" banner (`sync-banner.tsx` in `apps/web`)
 * reads it via `../sync-auth-status.ts`'s `useSyncAuthStatus` hook.
 *
 * Plain TypeScript, no `@powersync/web` import, so `connector.ts` can update it
 * and the banner can read it without either pulling in the SDK (ADR-0029,
 * decision 6) — the same seam `connectivity.ts` uses for the offline
 * indicator.
 */

export type SyncAuthStatus =
  /** Sync is authenticated as this store's own owner, or has not run yet. */
  | 'ok'
  /** No session the sync layer can use — refresh failed or was never signed in. */
  | 'signed-out'
  /** Signed in, but as an owner other than this store's — never flushed here. */
  | 'owner-mismatch';

type Listener = (status: SyncAuthStatus) => void;

// A mutable holder rather than a reassigned top-level `let`: this module is a
// page-wide singleton by design (there is exactly one sync layer per page),
// so the state lives here rather than behind a factory the way `session.ts`'s
// per-store state does.
const state: { status: SyncAuthStatus } = { status: 'ok' };
const listeners = new Set<Listener>();

/** Record what the connector just learned about its own authentication. */
export function setSyncAuthStatus(next: SyncAuthStatus): void {
  if (next === state.status) return;
  state.status = next;
  for (const listener of listeners) listener(state.status);
}

/** The status as of the last thing the connector reported. */
export function currentSyncAuthStatus(): SyncAuthStatus {
  return state.status;
}

/** Subscribe to status changes. Returns an unsubscribe function. */
export function onSyncAuthStatusChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

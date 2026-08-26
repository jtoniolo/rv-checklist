import { useEffect, useState } from 'react';
import {
  currentSyncAuthStatus,
  onSyncAuthStatusChange,
  type SyncAuthStatus,
} from './powersync/sync-auth-status.js';

export type { SyncAuthStatus } from './powersync/sync-auth-status.js';
// Re-exported so the connector's own status updates and a test's simulated
// ones go through the one seam — `SyncSignInBanner`'s spec drives the banner
// this way rather than standing up a fake PowerSync connector.
export { setSyncAuthStatus } from './powersync/sync-auth-status.js';

/**
 * Whether the sync layer can authenticate right now — for the "sign in to
 * sync" banner (issue #149; ADR-0028). Reads through the same plain-TypeScript
 * seam as `useIsOffline` (`connectivity.ts`), so no component imports
 * PowerSync directly (ADR-0029, decision 6).
 *
 * Starts `'ok'` in both the initial render and the server render — there is no
 * connector running server-side, so `'ok'` (banner hidden) is the only answer
 * that cannot be a hydration mismatch. The effect below corrects it to
 * whatever the connector already knows, then subscribes for changes.
 */
export function useSyncAuthStatus(): SyncAuthStatus {
  const [status, setStatus] = useState<SyncAuthStatus>('ok');

  useEffect(() => {
    setStatus(currentSyncAuthStatus());
    return onSyncAuthStatusChange(setStatus);
  }, []);

  return status;
}

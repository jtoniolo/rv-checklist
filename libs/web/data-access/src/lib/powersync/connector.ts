import type {
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/web';
import { config } from '../config.js';

/**
 * How the sync engine authenticates against the PowerSync service (ADR-0028).
 * `GET /auth/powersync-token` returns exactly `{ token, endpoint }` — the API
 * mints the short-lived HS256 JWT whose `sub` the sync rules read as
 * `token_parameters.user_id` — and it is authenticated by the same httpOnly
 * cookies as every other call (ADR-0019), so no token is ever read into JS.
 */
export class RvSyncConnector implements PowerSyncBackendConnector {
  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    const response = await fetch(`${config.apiBaseUrl}/auth/powersync-token`, {
      credentials: 'include',
    });

    // Signed out, or the session expired while the tab was open. Returning
    // null tells the SDK to stop rather than retry, which is the correct
    // behaviour for "no session" and the wrong one for "session recoverable" —
    // the sync layer owning its own refresh, and the banner that goes with it,
    // is #149. Until then the REST path's refresh (ADR-0019) restores the
    // session on the next user action and the next page load reconnects.
    // `null` is the SDK's contract for "not signed in"; undefined is not it.
    // eslint-disable-next-line unicorn/no-null
    if (response.status === 401) return null;

    // Anything else is transient: throwing makes the SDK back off and retry.
    if (!response.ok) {
      throw new Error(`powersync-token responded ${String(response.status)}`);
    }

    const credentials = (await response.json()) as PowerSyncCredentials;
    return { token: credentials.token, endpoint: credentials.endpoint };
  }

  async uploadData(): Promise<void> {
    // Nothing is written to the local store yet (#146 is the read path), so
    // the upload queue is always empty. This must return rather than throw:
    // a throw is how a connector reports a failed upload, and the SDK answers
    // it with an uncapped retry loop. Replaying queued operations through the
    // API is #147.
  }
}

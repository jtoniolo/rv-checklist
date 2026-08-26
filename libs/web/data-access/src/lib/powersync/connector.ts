import type {
  CrudEntry,
  CrudTransaction,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/web';
import { config } from '../config.js';
import { syncDeviceId } from './device-id.js';
import type { LocalStore } from './local-store.js';
import { subjectOf } from './owner.js';
import { setSyncAuthStatus } from './sync-auth-status.js';
import { localColumns, type LocalRow, type LocalTableName } from './tables.js';
import { parseUploadMetadata } from './upload-metadata.js';
import { planUpload, type UploadRequest } from './upload-plan.js';

/**
 * How the sync engine authenticates against the PowerSync service (ADR-0028).
 * `GET /auth/powersync-token` returns exactly `{ token, endpoint }` — the API
 * mints the short-lived HS256 JWT whose `sub` the sync rules read as
 * `token_parameters.user_id` — and it is authenticated by the same httpOnly
 * cookies as every other call (ADR-0019), so the session cookies are never read
 * into JS.
 *
 * The connector is built for one owner and refuses to hand the engine a token
 * belonging to anyone else (ADR-0029, decision 10). Replication writes into the
 * store it was opened over, so connecting owner A's file with owner B's token
 * would put B's rows in A's file and the owner-scoped filename would stop
 * describing its contents. The page memoises who is signed in, and the cookies
 * can change under it — a sign-in in a second tab — so the token is the last
 * place that mismatch can still be caught.
 */
export class RvSyncConnector implements PowerSyncBackendConnector {
  /** The owner whose store this connector replicates into. */
  private readonly owner: string;

  /**
   * A single in-flight `POST /auth/refresh`, shared by every 401 this
   * connector hits while it is running — a whole `uploadData` transaction can
   * throw several of those in a row (one per queued entry) and they must not
   * each mint their own refresh call (ADR-0028: rotation reuse is a ~2 minute
   * window, not an invitation to race it).
   */
  private refreshInFlight: Promise<boolean> | undefined;

  constructor(owner: string) {
    this.owner = owner;
  }

  /** Replay one queued entry through its semantic endpoint (ADR-0028). */
  private async replay(
    database: UploadDatabase,
    entry: CrudEntry,
  ): Promise<void> {
    const table = entry.table as LocalTableName;
    const metadata = parseUploadMetadata(entry.metadata);
    // Widened to `string`, not compared as `entry.op === UpdateType.DELETE`:
    // `@powersync/web`'s runtime export is ESM the Jest transform does not
    // touch (`upload-plan.ts` has the same note), so this module imports no
    // value from the SDK — only `CrudEntry`'s type, erased at compile.
    const op: string = entry.op;
    const row =
      op === 'DELETE' ? undefined : await fetchRow(database, table, entry.id);

    const request = planUpload(entry, row, metadata);
    if (request === undefined) return;

    await this.send(request, entry.clientId);
  }

  /**
   * Send one replayed operation, refreshing and retrying once on a 401 — the
   * access cookie can expire mid-flush with no page in the path to renew it
   * (ADR-0028). A 401 that survives the retry means the refresh token itself
   * is dead: the queue is held (this throws before `uploadData` can call
   * `transaction.complete()`) and the "sign in to sync" banner takes over.
   */
  private async send(request: UploadRequest, clientId: number): Promise<void> {
    let response = await sendOnce(request, clientId);

    if (response.status === 401) {
      if (await this.refreshSession()) {
        response = await sendOnce(request, clientId);
      }
      if (response.status === 401) {
        setSyncAuthStatus('signed-out');
        throw new Error(
          `${request.method} ${request.path} responded 401 after a refresh attempt`,
        );
      }
    }

    if (response.ok || request.fatalStatuses.includes(response.status)) return;

    throw new Error(
      `${request.method} ${request.path} responded ${String(response.status)}`,
    );
  }

  /**
   * `POST /auth/refresh`, single-flight per connector instance. Resolves
   * `false` on any non-2xx response or a network failure — both mean "still
   * not authenticated", and the caller's job either way is to stop rather
   * than retry the refresh itself.
   */
  private async refreshSession(): Promise<boolean> {
    this.refreshInFlight ??= (async () => {
      try {
        return await performRefresh();
      } finally {
        this.refreshInFlight = undefined;
      }
    })();
    return this.refreshInFlight;
  }

  async fetchCredentials(): Promise<PowerSyncCredentials | null> {
    let response = await fetchToken();

    // The access cookie can die between page load and this call, with no
    // navigation in between to carry the edge middleware's silent refresh
    // (ADR-0028). One retry after a refresh covers that invisibly; a session
    // that is truly gone still ends up at the 401 branch below.
    if (response.status === 401 && (await this.refreshSession())) {
      response = await fetchToken();
    }

    // Signed out, or the refresh token is dead too. Returning null tells the
    // SDK to stop rather than retry, which is the correct behaviour for "no
    // session" — the banner (#149) picks this signal up from the status
    // module below. `null` is the SDK's contract for "not signed in";
    // undefined is not it.
    if (response.status === 401) {
      setSyncAuthStatus('signed-out');
      // eslint-disable-next-line unicorn/no-null
      return null;
    }

    // Anything else is transient: throwing makes the SDK back off and retry.
    if (!response.ok) {
      throw new Error(`powersync-token responded ${String(response.status)}`);
    }

    const credentials = (await response.json()) as PowerSyncCredentials;

    // Someone else is signed in now. Stopping is the only safe answer: this
    // store is not theirs to fill, and the next page load opens the store the
    // token names. Same `null` contract as the 401 above; the status module
    // records *why*, distinctly from "not signed in", so the banner can say
    // which one it is.
    if (subjectOf(credentials.token) !== this.owner) {
      setSyncAuthStatus('owner-mismatch');
      // eslint-disable-next-line unicorn/no-null
      return null;
    }

    setSyncAuthStatus('ok');
    return { token: credentials.token, endpoint: credentials.endpoint };
  }

  /**
   * Replay the oldest not-yet-uploaded transaction through the semantic
   * endpoints (ADR-0028), one entry at a time, in the order the local write
   * path recorded them — the ordering a follow-up edit or an arrival after an
   * offline-created stop depends on.
   *
   * Only `transaction.complete()` drops entries from the queue, and it is
   * called once, after every entry in the transaction has either succeeded or
   * failed in a way that can never succeed (`UploadRequest.fatalStatuses`) —
   * so a transient failure partway through leaves the whole transaction
   * queued and this throws, which is how a connector tells the SDK to back
   * off and retry. The retry re-sends every entry from the top again,
   * including the ones that already landed; that is safe only because each
   * carries its own `Idempotency-Key` (#142), so a re-sent success returns
   * its recorded response instead of double-applying.
   *
   * A dead refresh token (`send` below) is the same shape of failure — it
   * throws before completing the transaction — so the whole queue is held
   * intact, never dropped and never reordered, until the owner signs back in.
   */
  async uploadData(database: UploadDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();

    if (transaction === null) return;

    for (const entry of transaction.crud) {
      await this.replay(database, entry);
    }
    await transaction.complete();
    setSyncAuthStatus('ok');
  }
}

/** `GET /auth/powersync-token`, cookie-authenticated (ADR-0019). */
function fetchToken(): Promise<Response> {
  return fetch(`${config.apiBaseUrl}/auth/powersync-token`, {
    credentials: 'include',
  });
}

async function performRefresh(): Promise<boolean> {
  try {
    const response = await fetch(`${config.apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    return response.ok;
  } catch {
    // Offline, or the request never reached the API — not authenticated
    // either way.
    return false;
  }
}

/** What `uploadData` needs from the local store: reads, plus the upload queue. */
export interface UploadDatabase extends LocalStore {
  getNextCrudTransaction(): Promise<CrudTransaction | null>;
}

async function fetchRow(
  database: LocalStore,
  table: LocalTableName,
  id: string,
): Promise<Record<string, unknown> | undefined> {
  if (table === 'users') return undefined;
  const rows = await database.getAll<LocalRow<LocalTableName>>(
    `SELECT ${localColumns(table)} FROM ${table} WHERE id = ?`,
    [id],
  );
  return rows[0];
}

/**
 * Send one replayed operation once, with no retry of its own — `send` above
 * owns the refresh-and-retry policy; this is just the HTTP call it repeats.
 */
async function sendOnce(
  request: UploadRequest,
  clientId: number,
): Promise<Response> {
  const headers: Record<string, string> = {
    'Idempotency-Key': `${syncDeviceId()}:${String(clientId)}`,
  };
  if (request.body !== undefined) headers['Content-Type'] = 'application/json';
  if (request.editedAt !== undefined) headers['X-Edited-At'] = request.editedAt;

  return fetch(`${config.apiBaseUrl}${request.path}`, {
    method: request.method,
    credentials: 'include',
    headers,
    ...(request.body !== undefined && { body: JSON.stringify(request.body) }),
  });
}

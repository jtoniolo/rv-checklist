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

    await send(request, entry.clientId);
  }

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

    // Someone else is signed in now. Stopping is the only safe answer: this
    // store is not theirs to fill, and the next page load opens the store the
    // token names. Same `null` contract as the 401 above.
    // eslint-disable-next-line unicorn/no-null
    if (subjectOf(credentials.token) !== this.owner) return null;

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
   */
  async uploadData(database: UploadDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();

    if (transaction === null) return;

    for (const entry of transaction.crud) {
      await this.replay(database, entry);
    }
    await transaction.complete();
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
 * Send one replayed operation. A response the request itself flags as
 * `fatalStatuses` — a taken client id on a create, a row already gone on a
 * patch or delete — is treated the same as success: it can never succeed by
 * retrying, so the entry is done. Anything else non-2xx (or a network
 * failure fetch throws on its own) propagates so the caller backs off.
 */
async function send(request: UploadRequest, clientId: number): Promise<void> {
  const headers: Record<string, string> = {
    'Idempotency-Key': `${syncDeviceId()}:${String(clientId)}`,
  };
  if (request.body !== undefined) headers['Content-Type'] = 'application/json';
  if (request.editedAt !== undefined) headers['X-Edited-At'] = request.editedAt;

  const response = await fetch(`${config.apiBaseUrl}${request.path}`, {
    method: request.method,
    credentials: 'include',
    headers,
    ...(request.body !== undefined && { body: JSON.stringify(request.body) }),
  });

  if (response.ok || request.fatalStatuses.includes(response.status)) return;

  throw new Error(
    `${request.method} ${request.path} responded ${String(response.status)}`,
  );
}

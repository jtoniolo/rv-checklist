import {
  OUTBOX_DB_NAME,
  OUTBOX_DB_VERSION,
  OUTBOX_STOP_INDEX,
  OUTBOX_STORE_NAME,
  type Id,
  type OutboxEntryStatus,
} from '@rv-checklist/domain';

/**
 * The page's half of the offline attachment outbox (ADR-0028, issue #152):
 * enqueue a capture taken while offline, list a stop's queued captures for
 * the "waiting to upload" / "failed" badges, and retry or discard one.
 *
 * `apps/web/sw/outbox-store.ts` is the worker's half — a separate file
 * reading and writing the exact same database (see `@rv-checklist/domain`'s
 * `outbox.ts` for why the schema lives there instead of a shared adapter).
 *
 * Every function takes an `IDBFactory` (default: the real `indexedDB`), the
 * same injected-global seam `browser-store.ts`/`local-store.ts` use for
 * PowerSync — it is what lets these run under Jest against `fake-indexeddb`
 * with no browser in sight.
 */

/** One queued capture, blob and all — a pending upload, or a failed one. */
export interface OutboxEntry {
  readonly id: Id;
  readonly stopId: Id;
  readonly tripId: Id;
  readonly rigId: Id;
  readonly filename: string;
  readonly mimeType: string;
  readonly blob: Blob;
  readonly isCampgroundMap: boolean;
  readonly status: OutboxEntryStatus;
  readonly errorMessage?: string;
  /** `Date.now()` at enqueue — list order, oldest first. */
  readonly createdAt: number;
}

/** What the caller supplies; the rest ({@link OutboxEntry.status}, `createdAt`) is minted here. */
export type NewOutboxEntry = Omit<
  OutboxEntry,
  'status' | 'errorMessage' | 'createdAt'
>;

/** Open (creating on first use) the outbox database. */
export function openOutboxDatabase(
  factory: IDBFactory = indexedDB,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(OUTBOX_DB_NAME, OUTBOX_DB_VERSION);
    request.addEventListener('upgradeneeded', () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OUTBOX_STORE_NAME)) {
        const store = db.createObjectStore(OUTBOX_STORE_NAME, {
          keyPath: 'id',
        });
        store.createIndex(OUTBOX_STOP_INDEX, 'stopId', { unique: false });
      }
    });
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('Failed to open the outbox database'));
    });
  });
}

/** Promisify one `IDBRequest`. */
function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('IndexedDB request failed'));
    });
  });
}

/** Promisify one `IDBTransaction` completing (as opposed to its request resolving). */
function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => {
      resolve();
    });
    transaction.addEventListener('error', () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed'));
    });
    transaction.addEventListener('abort', () => {
      reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
    });
  });
}

/**
 * Queue one offline capture — status starts `pending`. The caller mints the
 * id (the client-generated attachment id, #143) so the same value both names
 * the outbox row and, once replayed, the server row.
 */
export async function enqueueOutboxEntry(
  db: IDBDatabase,
  entry: NewOutboxEntry,
): Promise<OutboxEntry> {
  const record: OutboxEntry = {
    ...entry,
    status: 'pending',
    createdAt: Date.now(),
  };
  const transaction = db.transaction(OUTBOX_STORE_NAME, 'readwrite');
  transaction.objectStore(OUTBOX_STORE_NAME).put(record);
  await transactionDone(transaction);
  return record;
}

/** A stop's queued captures, oldest first — every status, for the badge list. */
export async function listOutboxEntriesForStop(
  db: IDBDatabase,
  stopId: Id,
): Promise<OutboxEntry[]> {
  const transaction = db.transaction(OUTBOX_STORE_NAME, 'readonly');
  const index = transaction
    .objectStore(OUTBOX_STORE_NAME)
    .index(OUTBOX_STOP_INDEX);
  const entries = await requestToPromise(
    index.getAll(stopId) as IDBRequest<OutboxEntry[]>,
  );
  // `Array#toSorted` needs `lib: "es2023"`; this package targets `es2022`.
  // eslint-disable-next-line unicorn/no-array-sort
  return [...entries].sort((a, b) => a.createdAt - b.createdAt);
}

/** Drop a queued entry — discarding a pending capture, or a failed one, with no server call. */
export async function deleteOutboxEntry(
  db: IDBDatabase,
  id: Id,
): Promise<void> {
  const transaction = db.transaction(OUTBOX_STORE_NAME, 'readwrite');
  transaction.objectStore(OUTBOX_STORE_NAME).delete(id);
  await transactionDone(transaction);
}

/**
 * Reset a failed entry back to `pending` for another flush attempt — the
 * "Retry" action on a failed badge. A no-op if the entry is gone (discarded
 * or already re-uploaded from elsewhere) rather than an error.
 */
export async function retryOutboxEntry(db: IDBDatabase, id: Id): Promise<void> {
  const transaction = db.transaction(OUTBOX_STORE_NAME, 'readwrite');
  const store = transaction.objectStore(OUTBOX_STORE_NAME);
  const existing = await requestToPromise(
    store.get(id) as IDBRequest<OutboxEntry | undefined>,
  );
  if (existing !== undefined) {
    const { errorMessage: _errorMessage, ...rest } = existing;
    const reset: OutboxEntry = { ...rest, status: 'pending' };
    store.put(reset);
  }
  await transactionDone(transaction);
}

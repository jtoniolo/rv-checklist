import {
  OUTBOX_DB_NAME,
  OUTBOX_DB_VERSION,
  OUTBOX_STOP_INDEX,
  OUTBOX_STORE_NAME,
  type OutboxEntryStatus,
} from '@rv-checklist/domain';

/**
 * The worker's half of the offline attachment outbox (ADR-0028, issue #152):
 * read the entries a Background Sync flush must replay, and record what each
 * attempt did. `libs/web/data-access/src/lib/outbox/outbox-db.ts` is the
 * page's half — writing captures and reading them for the badge list — a
 * separate file over the exact same schema (see `@rv-checklist/domain`'s
 * `outbox.ts` for why; the short version is this file's `lib` is
 * `webworker`, that one's is `dom`, and neither type set is visible from a
 * package built with neither).
 */

/** One queued capture, exactly as `outbox-db.ts` stores it — this file never writes a new one. */
export interface OutboxEntry {
  readonly id: string;
  readonly stopId: string;
  readonly tripId: string;
  readonly rigId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly blob: Blob;
  readonly isCampgroundMap: boolean;
  readonly status: OutboxEntryStatus;
  readonly errorMessage?: string;
  readonly createdAt: number;
}

/** Open the same outbox database the page writes into — never creates it (nothing to flush if it doesn't exist yet). */
export function openOutboxDatabase(
  factory: IDBFactory = indexedDB,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(OUTBOX_DB_NAME, OUTBOX_DB_VERSION);
    // If the page has never opened the database, this creates it with the
    // same schema as `outbox-db.ts`'s upgrade — harmless (an empty outbox is
    // exactly what an untouched device flushes), and keeps this module
    // self-contained rather than depending on upgrade-ordering across files.
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

/** Every queued entry, in the order it was captured — a flush replays oldest first. */
export async function listPendingOutboxEntries(
  db: IDBDatabase,
): Promise<OutboxEntry[]> {
  const transaction = db.transaction(OUTBOX_STORE_NAME, 'readonly');
  const all = await requestToPromise(
    transaction.objectStore(OUTBOX_STORE_NAME).getAll() as IDBRequest<
      OutboxEntry[]
    >,
  );
  return all
    .filter((entry) => entry.status === 'pending')
    .toSorted((a, b) => a.createdAt - b.createdAt);
}

/** Drop an entry that uploaded successfully. */
export async function deleteOutboxEntry(
  db: IDBDatabase,
  id: string,
): Promise<void> {
  const transaction = db.transaction(OUTBOX_STORE_NAME, 'readwrite');
  transaction.objectStore(OUTBOX_STORE_NAME).delete(id);
  await transactionDone(transaction);
}

/** Badge an entry failed — a 4xx that can never succeed by retrying the same bytes. */
export async function markOutboxEntryFailed(
  db: IDBDatabase,
  id: string,
  errorMessage: string,
): Promise<void> {
  const transaction = db.transaction(OUTBOX_STORE_NAME, 'readwrite');
  const store = transaction.objectStore(OUTBOX_STORE_NAME);
  const existing = await requestToPromise(
    store.get(id) as IDBRequest<OutboxEntry | undefined>,
  );
  if (existing !== undefined) {
    const updated: OutboxEntry = {
      ...existing,
      status: 'failed',
      errorMessage,
    };
    store.put(updated);
  }
  await transactionDone(transaction);
}

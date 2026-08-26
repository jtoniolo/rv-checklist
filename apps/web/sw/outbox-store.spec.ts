import { IDBFactory } from 'fake-indexeddb';
import {
  deleteOutboxEntry,
  listPendingOutboxEntries,
  markOutboxEntryFailed,
  openOutboxDatabase,
  type OutboxEntry,
} from './outbox-store.js';

/** A fresh, isolated `IDBFactory` per test — no state leaks between specs. */
function freshDb(): Promise<IDBDatabase> {
  return openOutboxDatabase(new IDBFactory());
}

async function seed(db: IDBDatabase, entry: OutboxEntry): Promise<void> {
  const transaction = db.transaction('entries', 'readwrite');
  transaction.objectStore('entries').put(entry);
  await new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => {
      resolve();
    });
    transaction.addEventListener('error', () => {
      reject(transaction.error ?? new Error('seed transaction failed'));
    });
  });
}

function entry(overrides: Partial<OutboxEntry> = {}): OutboxEntry {
  return {
    id: 'a',
    stopId: 'stop-1',
    tripId: 'trip-1',
    rigId: 'rig-1',
    filename: 'map.png',
    mimeType: 'image/png',
    blob: new Blob(['bytes'], { type: 'image/png' }),
    isCampgroundMap: false,
    status: 'pending',
    createdAt: 1,
    ...overrides,
  };
}

describe('listPendingOutboxEntries', () => {
  it('returns only pending entries, oldest first', async () => {
    const db = await freshDb();
    await seed(db, entry({ id: 'b', status: 'pending', createdAt: 2 }));
    await seed(db, entry({ id: 'a', status: 'pending', createdAt: 1 }));
    await seed(db, entry({ id: 'c', status: 'failed', createdAt: 0 }));

    const pending = await listPendingOutboxEntries(db);

    expect(pending.map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('deleteOutboxEntry', () => {
  it('removes the entry — a successful upload', async () => {
    const db = await freshDb();
    await seed(db, entry({ id: 'a' }));

    await deleteOutboxEntry(db, 'a');

    expect(await listPendingOutboxEntries(db)).toEqual([]);
  });
});

describe('markOutboxEntryFailed', () => {
  it('flips the entry to failed with the given message', async () => {
    const db = await freshDb();
    await seed(db, entry({ id: 'a' }));

    await markOutboxEntryFailed(db, 'a', "isn't a supported type");

    expect(await listPendingOutboxEntries(db)).toEqual([]);
  });
});

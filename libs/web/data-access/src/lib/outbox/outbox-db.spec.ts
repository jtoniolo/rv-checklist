import { IDBFactory } from 'fake-indexeddb';
import {
  deleteOutboxEntry,
  enqueueOutboxEntry,
  listOutboxEntriesForStop,
  openOutboxDatabase,
  retryOutboxEntry,
  type NewOutboxEntry,
} from './outbox-db.js';

/** A fresh, isolated `IDBFactory` per test — no state leaks between specs. */
function freshDb(): Promise<IDBDatabase> {
  return openOutboxDatabase(new IDBFactory());
}

function newEntry(overrides: Partial<NewOutboxEntry> = {}): NewOutboxEntry {
  return {
    id: 'attachment-1',
    stopId: 'stop-1',
    tripId: 'trip-1',
    rigId: 'rig-1',
    filename: 'reservation.pdf',
    mimeType: 'application/pdf',
    blob: new Blob(['bytes'], { type: 'application/pdf' }),
    isCampgroundMap: false,
    ...overrides,
  };
}

describe('enqueueOutboxEntry', () => {
  it('stores the entry as pending', async () => {
    const db = await freshDb();

    const stored = await enqueueOutboxEntry(db, newEntry());

    expect(stored.status).toBe('pending');
    expect(stored.id).toBe('attachment-1');
  });
});

describe('listOutboxEntriesForStop', () => {
  it("lists only the given stop's entries, oldest first", async () => {
    const db = await freshDb();
    await enqueueOutboxEntry(db, newEntry({ id: 'a', stopId: 'stop-1' }));
    await enqueueOutboxEntry(db, newEntry({ id: 'b', stopId: 'stop-1' }));
    await enqueueOutboxEntry(db, newEntry({ id: 'c', stopId: 'stop-2' }));

    const entries = await listOutboxEntriesForStop(db, 'stop-1');

    expect(entries.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('returns an empty list for a stop with nothing queued', async () => {
    const db = await freshDb();

    expect(await listOutboxEntriesForStop(db, 'stop-nothing')).toEqual([]);
  });
});

describe('deleteOutboxEntry', () => {
  it('drops the entry — discarding a pending capture with no server call', async () => {
    const db = await freshDb();
    await enqueueOutboxEntry(db, newEntry({ id: 'a', stopId: 'stop-1' }));

    await deleteOutboxEntry(db, 'a');

    expect(await listOutboxEntriesForStop(db, 'stop-1')).toEqual([]);
  });
});

describe('retryOutboxEntry', () => {
  it('resets a failed entry back to pending and clears its error', async () => {
    const db = await freshDb();
    await enqueueOutboxEntry(db, newEntry({ id: 'a', stopId: 'stop-1' }));
    const transaction = db.transaction('entries', 'readwrite');
    transaction.objectStore('entries').put({
      ...newEntry({ id: 'a', stopId: 'stop-1' }),
      status: 'failed',
      errorMessage: "isn't a supported type",
      createdAt: 1,
    });
    await new Promise((resolve) => {
      transaction.oncomplete = resolve;
    });

    await retryOutboxEntry(db, 'a');

    const [entry] = await listOutboxEntriesForStop(db, 'stop-1');
    expect(entry?.status).toBe('pending');
    expect(entry?.errorMessage).toBeUndefined();
  });

  it('is a no-op when the entry is gone', async () => {
    const db = await freshDb();

    await expect(retryOutboxEntry(db, 'missing')).resolves.toBeUndefined();
  });
});

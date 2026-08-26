import type { OutboxBroadcastMessage } from '@rv-checklist/domain';
import { IDBFactory } from 'fake-indexeddb';
import { flushOutbox } from './outbox-flush.js';
import { openOutboxDatabase, type OutboxEntry } from './outbox-store.js';

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
    id: 'attachment-1',
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

async function listAll(db: IDBDatabase): Promise<OutboxEntry[]> {
  const transaction = db.transaction('entries', 'readonly');
  const request = transaction.objectStore('entries').getAll();
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => {
      resolve(request.result as OutboxEntry[]);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('listAll request failed'));
    });
  });
}

function okResponse(): Response {
  return new Response(undefined, { status: 201 });
}

describe('flushOutbox', () => {
  it('uploads a pending entry, drops it on success, and broadcasts the change', async () => {
    const db = await freshDb();
    await seed(db, entry());
    const fetcher = jest.fn().mockResolvedValue(okResponse());
    const broadcast = jest.fn((_message: OutboxBroadcastMessage) => {
      /* no-op */
    });

    const result = await flushOutbox({
      db,
      apiBaseUrl: 'https://api.test',
      fetcher,
      broadcast,
    });

    expect(result.shouldRetry).toBe(false);
    expect(await listAll(db)).toEqual([]);
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.test/stops/stop-1/attachments',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(broadcast).toHaveBeenCalledWith({
      type: 'rv-checklist/outbox-updated',
      stopId: 'stop-1',
    });
  });

  it('sends the multipart id and isCampgroundMap fields alongside the file', async () => {
    const db = await freshDb();
    await seed(db, entry({ isCampgroundMap: true }));
    let sentBody: FormData | undefined;
    const fetcher = jest.fn().mockImplementation((_url, init: RequestInit) => {
      sentBody = init.body as FormData;
      return Promise.resolve(okResponse());
    });

    await flushOutbox({
      db,
      apiBaseUrl: 'https://api.test',
      fetcher,
      broadcast: jest.fn(),
    });

    expect(sentBody?.get('id')).toBe('attachment-1');
    expect(sentBody?.get('isCampgroundMap')).toBe('true');
    expect(sentBody?.get('file')).toBeInstanceOf(Blob);
  });

  it('leaves a transient failure (5xx) pending and asks for a retry', async () => {
    const db = await freshDb();
    await seed(db, entry());
    const fetcher = jest
      .fn()
      .mockResolvedValue(new Response(undefined, { status: 503 }));

    const result = await flushOutbox({
      db,
      apiBaseUrl: 'https://api.test',
      fetcher,
      broadcast: jest.fn(),
    });

    expect(result.shouldRetry).toBe(true);
    const [remaining] = await listAll(db);
    expect(remaining?.status).toBe('pending');
  });

  it('leaves a 404 ("stop not found") pending and asks for a retry', async () => {
    const db = await freshDb();
    await seed(db, entry());
    const fetcher = jest
      .fn()
      .mockResolvedValue(new Response(undefined, { status: 404 }));

    const result = await flushOutbox({
      db,
      apiBaseUrl: 'https://api.test',
      fetcher,
      broadcast: jest.fn(),
    });

    expect(result.shouldRetry).toBe(true);
  });

  it('retries on a thrown fetch (offline mid-flush)', async () => {
    const db = await freshDb();
    await seed(db, entry());
    const fetcher = jest.fn().mockRejectedValue(new Error('network down'));

    const result = await flushOutbox({
      db,
      apiBaseUrl: 'https://api.test',
      fetcher,
      broadcast: jest.fn(),
    });

    expect(result.shouldRetry).toBe(true);
  });

  it('marks an entry failed on another 4xx and broadcasts the change', async () => {
    const db = await freshDb();
    await seed(db, entry());
    const fetcher = jest
      .fn()
      .mockResolvedValue(
        Response.json({ message: 'Attachment is empty' }, { status: 400 }),
      );
    const broadcast = jest.fn((_message: OutboxBroadcastMessage) => {
      /* no-op */
    });

    const result = await flushOutbox({
      db,
      apiBaseUrl: 'https://api.test',
      fetcher,
      broadcast,
    });

    expect(result.shouldRetry).toBe(false);
    const [remaining] = await listAll(db);
    expect(remaining?.status).toBe('failed');
    expect(remaining?.errorMessage).toBe('Attachment is empty');
    expect(broadcast).toHaveBeenCalledWith({
      type: 'rv-checklist/outbox-updated',
      stopId: 'stop-1',
    });
  });

  it('retries once after a 401, then succeeds if the refresh works', async () => {
    const db = await freshDb();
    await seed(db, entry());
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(new Response(undefined, { status: 401 }))
      .mockResolvedValueOnce(new Response(undefined, { status: 204 })) // /auth/refresh
      .mockResolvedValueOnce(okResponse());

    const result = await flushOutbox({
      db,
      apiBaseUrl: 'https://api.test',
      fetcher,
      broadcast: jest.fn(),
    });

    expect(result.shouldRetry).toBe(false);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'https://api.test/auth/refresh',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await listAll(db)).toEqual([]);
  });

  it('holds the whole outbox and broadcasts auth-required on a 401 that survives refresh', async () => {
    const db = await freshDb();
    await seed(db, entry({ id: 'a', stopId: 'stop-1' }));
    await seed(db, entry({ id: 'b', stopId: 'stop-2' }));
    const fetcher = jest
      .fn()
      .mockResolvedValue(new Response(undefined, { status: 401 }));
    const broadcast = jest.fn((_message: OutboxBroadcastMessage) => {
      /* no-op */
    });

    const result = await flushOutbox({
      db,
      apiBaseUrl: 'https://api.test',
      fetcher,
      broadcast,
    });

    expect(result.shouldRetry).toBe(true);
    expect(broadcast).toHaveBeenCalledWith({
      type: 'rv-checklist/outbox-auth-required',
    });
    // Both entries are still queued — the second was never attempted.
    const remaining = await listAll(db);
    expect(
      remaining.map((e) => e.id).toSorted((a, b) => a.localeCompare(b)),
    ).toEqual(['a', 'b']);
    expect(remaining.every((e) => e.status === 'pending')).toBe(true);
  });

  it("does not let one stop's retryable entry block another stop's upload", async () => {
    const db = await freshDb();
    await seed(db, entry({ id: 'a', stopId: 'stop-not-synced', createdAt: 1 }));
    await seed(db, entry({ id: 'b', stopId: 'stop-2', createdAt: 2 }));
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(new Response(undefined, { status: 404 }))
      .mockResolvedValueOnce(okResponse());

    const result = await flushOutbox({
      db,
      apiBaseUrl: 'https://api.test',
      fetcher,
      broadcast: jest.fn(),
    });

    expect(result.shouldRetry).toBe(true);
    const remaining = await listAll(db);
    expect(remaining.map((e) => e.id)).toEqual(['a']);
  });
});

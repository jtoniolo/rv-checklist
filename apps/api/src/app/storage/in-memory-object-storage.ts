import { Readable } from 'node:stream';
import { ObjectStorage, type StoredObject } from './object-storage.js';

/**
 * In-memory {@link ObjectStorage} double — the test-support binding for the
 * bucket seam, mirroring the in-memory repositories. Backed by a `Map` keyed
 * by object key; `keys()` lets a spec assert exactly which objects remain, so
 * the cascade-deletion specs can prove no orphans.
 */
export class InMemoryObjectStorage extends ObjectStorage {
  private readonly objects = new Map<
    string,
    { body: Buffer; contentType: string }
  >();

  put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body: Buffer.from(body), contentType });
    return Promise.resolve();
  }

  get(key: string): Promise<StoredObject> {
    const stored = this.objects.get(key);
    if (!stored) {
      return Promise.reject(new Error(`No such key: ${key}`));
    }
    return Promise.resolve({
      body: Readable.from(Buffer.from(stored.body)),
      contentType: stored.contentType,
    });
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }

  deletePrefix(prefix: string): Promise<void> {
    for (const key of this.objects.keys()) {
      if (key.startsWith(prefix)) {
        this.objects.delete(key);
      }
    }
    return Promise.resolve();
  }

  /** Every stored key — the assertion surface for the no-orphan specs. */
  keys(): string[] {
    const keys: string[] = [];
    for (const key of this.objects.keys()) {
      keys.push(key);
    }
    return keys;
  }
}

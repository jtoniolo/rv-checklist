import type { MinimalCache, MinimalCacheStorage } from '../attachment-cache.js';

/**
 * An in-memory stand-in for the browser's `CacheStorage` (issue #151). The
 * real thing does not exist under Jest's jsdom environment, and every one of
 * the modules under `sw/` takes its cache storage as a parameter precisely so
 * a fake this small is enough to exercise the warming and eviction logic
 * without a real service worker.
 *
 * `Map` preserves insertion order, which is what backs the LRU eviction test:
 * the oldest `put` is the first key `keys()` returns, exactly like the real
 * Cache API's documented iteration order.
 */
class FakeCache implements MinimalCache {
  private readonly entries = new Map<string, Response>();

  match(request: string): Promise<Response | undefined> {
    const response = this.entries.get(request);
    return Promise.resolve(
      response === undefined ? undefined : response.clone(),
    );
  }

  put(request: string, response: Response): Promise<void> {
    this.entries.set(request, response);
    return Promise.resolve();
  }

  delete(request: string): Promise<boolean> {
    return Promise.resolve(this.entries.delete(request));
  }

  keys(): Promise<readonly { readonly url: string }[]> {
    return Promise.resolve(
      this.entries
        .keys()
        .map((url) => ({ url }))
        .toArray(),
    );
  }
}

export class FakeCacheStorage implements MinimalCacheStorage {
  private readonly caches = new Map<string, FakeCache>();

  open(cacheName: string): Promise<MinimalCache> {
    let cache = this.caches.get(cacheName);
    if (cache === undefined) {
      cache = new FakeCache();
      this.caches.set(cacheName, cache);
    }
    return Promise.resolve(cache);
  }

  has(cacheName: string): Promise<boolean> {
    return Promise.resolve(this.caches.has(cacheName));
  }

  delete(cacheName: string): Promise<boolean> {
    return Promise.resolve(this.caches.delete(cacheName));
  }

  keys(): Promise<readonly string[]> {
    return Promise.resolve(this.caches.keys().toArray());
  }

  async match(request: string): Promise<Response | undefined> {
    for (const cache of this.caches.values()) {
      const hit = await cache.match(request);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
}

import type { LocalTableName } from './tables.js';

/**
 * The seam between the read path and `@powersync/web` (ADR-0029). Everything
 * above this interface — the projections, the queries, and the watch-to-cache
 * reducer — is plain TypeScript that runs under Jest against a fake, which is
 * what makes the read path testable in an environment with no IndexedDB,
 * Worker, wasm or `navigator.storage`. `client.ts` is the one implementation.
 */

/** Reads against the local SQLite store. */
export interface LocalStore {
  getAll<Row>(sql: string, parameters?: unknown[]): Promise<Row[]>;
}

/** The live local database: reads, a change feed, and the first-sync gate. */
export interface LocalDatabase {
  readonly store: LocalStore;
  /**
   * Resolves once replication has completed at least once, or once `signal`
   * aborts. On a returning device this is already true from persisted state,
   * so an offline cold boot resolves immediately; on a fresh device offline it
   * never resolves, which is the point — see {@link LocalQuery}.
   */
  waitForFirstSync(signal: AbortSignal): Promise<void>;
  /** Calls `notify` whenever one of `tables` changes. Returns a dispose function. */
  onChange(tables: readonly LocalTableName[], notify: () => void): () => void;
}

/** A cache entry's worth of local data: what to read, and what makes it stale. */
export interface LocalQuery<Result> {
  /** The tables whose changes make the result stale. */
  readonly tables: readonly LocalTableName[];
  /**
   * Read and project. Returns `undefined` when the local store cannot answer —
   * a single-row query whose row is absent — which leaves the cache entry to
   * the network response or the SSR seed rather than overwriting it.
   */
  run(store: LocalStore): Promise<Result | undefined>;
}

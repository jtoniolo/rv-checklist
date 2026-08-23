import { column, PowerSyncDatabase, Schema, Table } from '@powersync/web';
import { RvSyncConnector } from './connector.js';
import type { LocalDatabase } from './local-store.js';
import {
  forgetStoreOwner,
  resolveStoreOwner,
  storeFilenameFor,
} from './owner.js';
import { createLocalStoreSession } from './session.js';
import { localIndexes, localTables, type LocalTableName } from './tables.js';

/**
 * The one module that touches `@powersync/web` (ADR-0029). Everything else in
 * `powersync/` is plain TypeScript behind the `LocalDatabase` seam, and this
 * file is reached only through a dynamic import from `browser-store.ts` — so
 * nothing pulls the SDK, its Worker or its wasm into the server render.
 */

/**
 * Where `powersync-web copy-assets` writes the SDK's worker bundle and the
 * wasm it loads beside it (`apps/web/public/@powersync/`). Referencing it by
 * URL rather than letting the SDK resolve `new URL('./worker.js',
 * import.meta.url)` keeps the wasm out of the bundler's hands: Turbopack has
 * no wasm handling configured here and OpenNext deploys `public/` as
 * `.open-next/assets`, so a bundled import would have to be solved twice.
 *
 * Both the database worker and the shared sync worker load this same file —
 * the SDK selects a service over the message port.
 */
const workerUrl = '/@powersync/worker.js';

/**
 * One database, one worker, one connection per page — but per *owner*, and
 * released on sign-out. The session owns that policy; this module only knows
 * how to open and dispose a store (ADR-0029, decision 10).
 */
const session = createLocalStoreSession({
  resolveOwner: resolveStoreOwner,
  openStore: open,
  forgetOwner: forgetStoreOwner,
});

/** Open the signed-in owner's local store and start replication. */
export function openLocalDatabase(): Promise<LocalDatabase | undefined> {
  return session.open();
}

/** Release the local store when the session changes; see `LocalStoreSession`. */
export function resetLocalDatabase(options: { clear: boolean }): Promise<void> {
  return session.reset(options);
}

async function open(owner: string): Promise<LocalDatabase> {
  const database = new PowerSyncDatabase({
    schema: buildSchema(),
    database: { dbFilename: storeFilenameFor(owner), worker: workerUrl },
    sync: { worker: workerUrl },
  });
  await database.init();

  void requestPersistentStorage();

  // Resolves once the sync client has started, not once it has connected, so
  // an offline boot falls straight through to reading the persisted store.
  // Reconnect and backoff are the SDK's defaults from here on.
  void database.connect(new RvSyncConnector()).catch(() => {
    // Failing to start replication must not take the local read path with it:
    // whatever synced before is still readable.
  });

  return {
    store: database,
    waitForFirstSync: (signal) => database.waitForFirstSync(signal),
    onChange: (tables, notify) =>
      database.onChangeWithCallback(
        {
          onChange: () => {
            notify();
          },
        },
        { tables: [...tables] },
      ),
    clear: async () => {
      await database.disconnectAndClear();
      await database.close();
    },
    close: () => database.close(),
  };
}

/**
 * Ask the browser to exempt this origin's storage from eviction. Chrome grants
 * it silently to installed or engaged origins; off grid the local store is the
 * only copy of the owner's data, so losing it to storage pressure is not
 * recoverable. Asked once, and not re-asked once already granted.
 */
async function requestPersistentStorage(): Promise<void> {
  try {
    if (!(await navigator.storage.persisted())) {
      await navigator.storage.persist();
    }
  } catch {
    // No Storage API, or the call was blocked — eviction protection is
    // best-effort and the store works without it.
  }
}

/** Build the PowerSync schema from the single table declaration. */
function buildSchema(): Schema {
  const tables = Object.fromEntries(
    Object.entries(localTables).map(([name, columns]) => {
      const indexes = localIndexes[name as LocalTableName];
      return [
        name,
        new Table(
          Object.fromEntries(
            Object.entries(columns).map(([columnName, kind]) => [
              columnName,
              kind.startsWith('integer') ? column.integer : column.text,
            ]),
          ),
          { ...(indexes !== undefined && { indexes }) },
        ),
      ];
    }),
  );
  return new Schema(tables);
}

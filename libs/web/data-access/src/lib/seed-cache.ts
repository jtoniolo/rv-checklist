import type {
  Checklist,
  Id,
  LogEntry,
  MaintenanceTask,
  Owner,
  Rig,
  Run,
  TripRead,
} from '@rv-checklist/domain';
import { api } from './api.js';
import { signedIn } from './auth.slice.js';
import type { AppStore, RootState } from './store.js';

/**
 * Seed server-fetched data into the RTK Query cache (ADR-0018 — Pattern C).
 * Called from the client-side CacheSeeder component during its first render
 * so child hooks read populated entries on both SSR and hydration. Each
 * function wraps `api.util.upsertQueryEntries` with the correct endpoint name
 * and cache key so callers don't depend on the endpoint string literals.
 *
 * A seed never replaces newer client-fetched data (issue #134): each helper
 * is a no-op when the store already holds a fulfilled cache entry for the
 * same endpoint + argument. On Back/Forward navigation Next.js replays the
 * cached RSC payload, so the remounting page would otherwise upsert stale
 * server data over a cache RTK Query has since refetched. Uninitialized,
 * pending, and rejected entries still seed — the server builds a fresh store
 * per request and a genuine first mount starts empty, so Pattern C first
 * paint is intact.
 *
 * `upsertQueryEntries` is a plain synchronous action: the entry is fulfilled
 * the moment it is dispatched, so hooks rendered in the same server pass read
 * the data and the SSR HTML contains it (ADR-0018). RTK registers the
 * endpoint's provided tags for upserted entries itself, so mutations'
 * invalidation still reaches seeded entries.
 */

/** Guard + dispatch shared by every seed helper. */
function seedIfAbsent(
  store: AppStore,
  select: (state: RootState) => { isSuccess: boolean },
  upsert: ReturnType<typeof api.util.upsertQueryEntries>,
): void {
  if (select(store.getState()).isSuccess) return;
  store.dispatch(upsert);
}

export function seedSignedIn(store: AppStore): void {
  store.dispatch(signedIn());
}

export function seedMe(store: AppStore, data: Owner): void {
  seedIfAbsent(
    store,
    api.endpoints.me.select(),
    api.util.upsertQueryEntries([
      { endpointName: 'me', arg: undefined, value: data },
    ]),
  );
}

export function seedRigs(store: AppStore, data: Rig[]): void {
  seedIfAbsent(
    store,
    api.endpoints.listRigs.select(),
    api.util.upsertQueryEntries([
      { endpointName: 'listRigs', arg: undefined, value: data },
    ]),
  );
}

export function seedTasks(
  store: AppStore,
  rigId: Id,
  data: MaintenanceTask[],
): void {
  seedIfAbsent(
    store,
    api.endpoints.listTasks.select(rigId),
    api.util.upsertQueryEntries([
      { endpointName: 'listTasks', arg: rigId, value: data },
    ]),
  );
}

export function seedLogEntriesByRig(
  store: AppStore,
  rigId: Id,
  data: LogEntry[],
): void {
  seedIfAbsent(
    store,
    api.endpoints.listLogEntriesByRig.select(rigId),
    api.util.upsertQueryEntries([
      { endpointName: 'listLogEntriesByRig', arg: rigId, value: data },
    ]),
  );
}

export function seedChecklists(
  store: AppStore,
  rigId: Id,
  data: Checklist[],
): void {
  seedIfAbsent(
    store,
    api.endpoints.listChecklists.select(rigId),
    api.util.upsertQueryEntries([
      { endpointName: 'listChecklists', arg: rigId, value: data },
    ]),
  );
}

export function seedRun(store: AppStore, runId: Id, data: Run): void {
  seedIfAbsent(
    store,
    api.endpoints.getRun.select(runId),
    api.util.upsertQueryEntries([
      { endpointName: 'getRun', arg: runId, value: data },
    ]),
  );
}

export function seedRunsByRig(store: AppStore, rigId: Id, data: Run[]): void {
  seedIfAbsent(
    store,
    api.endpoints.listRunsByRig.select(rigId),
    api.util.upsertQueryEntries([
      { endpointName: 'listRunsByRig', arg: rigId, value: data },
    ]),
  );
}

export function seedRunsByTrip(store: AppStore, tripId: Id, data: Run[]): void {
  seedIfAbsent(
    store,
    api.endpoints.listRunsByTrip.select(tripId),
    api.util.upsertQueryEntries([
      { endpointName: 'listRunsByTrip', arg: tripId, value: data },
    ]),
  );
}

export function seedTrips(store: AppStore, rigId: Id, data: TripRead[]): void {
  seedIfAbsent(
    store,
    api.endpoints.listTripsByRig.select(rigId),
    api.util.upsertQueryEntries([
      { endpointName: 'listTripsByRig', arg: rigId, value: data },
    ]),
  );
}

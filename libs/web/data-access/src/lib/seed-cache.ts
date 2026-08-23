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
 * function wraps `api.util.upsertQueryData` with the correct endpoint name
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
 * `upsertQueryData` returns a thunk whose fulfilled action is dispatched in a
 * microtask. The CacheSeeder ignores the returned promise — the data populates
 * the cache once the microtask resolves, which is fast enough that hooks
 * re-render with data before the user sees a flash.
 */

function hasFulfilledEntry(
  store: AppStore,
  select: (state: RootState) => { isSuccess: boolean },
): boolean {
  return select(store.getState()).isSuccess;
}

export function seedSignedIn(store: AppStore): void {
  store.dispatch(signedIn());
}

export function seedMe(store: AppStore, data: Owner): void {
  if (hasFulfilledEntry(store, api.endpoints.me.select())) return;
  void store.dispatch(api.util.upsertQueryData('me', undefined, data));
}

export function seedRigs(store: AppStore, data: Rig[]): void {
  if (hasFulfilledEntry(store, api.endpoints.listRigs.select())) return;
  void store.dispatch(api.util.upsertQueryData('listRigs', undefined, data));
}

export function seedTasks(
  store: AppStore,
  rigId: Id,
  data: MaintenanceTask[],
): void {
  if (hasFulfilledEntry(store, api.endpoints.listTasks.select(rigId))) return;
  void store.dispatch(api.util.upsertQueryData('listTasks', rigId, data));
}

export function seedLogEntriesByRig(
  store: AppStore,
  rigId: Id,
  data: LogEntry[],
): void {
  if (hasFulfilledEntry(store, api.endpoints.listLogEntriesByRig.select(rigId)))
    return;
  void store.dispatch(
    api.util.upsertQueryData('listLogEntriesByRig', rigId, data),
  );
}

export function seedChecklists(
  store: AppStore,
  rigId: Id,
  data: Checklist[],
): void {
  if (hasFulfilledEntry(store, api.endpoints.listChecklists.select(rigId)))
    return;
  void store.dispatch(api.util.upsertQueryData('listChecklists', rigId, data));
}

export function seedRun(store: AppStore, runId: Id, data: Run): void {
  if (hasFulfilledEntry(store, api.endpoints.getRun.select(runId))) return;
  void store.dispatch(api.util.upsertQueryData('getRun', runId, data));
}

export function seedRunsByRig(store: AppStore, rigId: Id, data: Run[]): void {
  if (hasFulfilledEntry(store, api.endpoints.listRunsByRig.select(rigId)))
    return;
  void store.dispatch(api.util.upsertQueryData('listRunsByRig', rigId, data));
}

export function seedRunsByTrip(store: AppStore, tripId: Id, data: Run[]): void {
  if (hasFulfilledEntry(store, api.endpoints.listRunsByTrip.select(tripId)))
    return;
  void store.dispatch(api.util.upsertQueryData('listRunsByTrip', tripId, data));
}

export function seedTrips(store: AppStore, rigId: Id, data: TripRead[]): void {
  if (hasFulfilledEntry(store, api.endpoints.listTripsByRig.select(rigId)))
    return;
  void store.dispatch(api.util.upsertQueryData('listTripsByRig', rigId, data));
}

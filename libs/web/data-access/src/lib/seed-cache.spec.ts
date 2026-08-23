/**
 * @jest-environment jsdom
 *
 * The Pattern C seed guard (issue #134): a seed populates an empty cache but
 * never replaces a fulfilled entry for the same endpoint + argument — on
 * Back/Forward navigation Next.js replays a stale RSC payload over a cache
 * RTK Query has since refetched. Non-fulfilled entries (uninitialized,
 * rejected) still seed, so SSR and genuine first mounts are unaffected.
 * Runs under jsdom for a real localStorage (the lib's default is node).
 */
import type {
  Checklist,
  LogEntry,
  MaintenanceTask,
  Owner,
  Rig,
  Run,
  TripRead,
} from '@rv-checklist/domain';
import { api } from './api.js';
import {
  seedChecklists,
  seedLogEntriesByRig,
  seedMe,
  seedRigs,
  seedRun,
  seedRunsByRig,
  seedRunsByTrip,
  seedTasks,
  seedTrips,
} from './seed-cache.js';
import { makeStore, type AppStore } from './store.js';

// jsdom ships no fetch; give this suite one that always rejects (the house
// no-network pattern, see apps/web/src/test-setup.ts) so the rejected-entry
// test can drive a real query to failure without dialling out.
Object.assign(globalThis, {
  fetch: (): Promise<never> =>
    Promise.reject(new Error('No network in tests — mock fetch.')),
});

// Every unsubscribe on unmount arms RTK Query's 60s keepUnusedDataFor
// eviction timer; resetting each store in afterEach clears them so in-band
// Jest can exit.
const stores: AppStore[] = [];

function trackedStore(): AppStore {
  const store = makeStore();
  stores.push(store);
  return store;
}

/** Flush the microtask in which `upsertQueryData` resolves. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function queryData(store: AppStore, prefix: string): unknown {
  const { api: apiState } = store.getState();
  const key = Object.keys(apiState.queries).find((k) => k.startsWith(prefix));
  if (key === undefined) return undefined;
  return (apiState.queries[key] as { data?: unknown } | undefined)?.data;
}

const ownerId = '550e8400-e29b-41d4-a716-446655440001';
const rigId = '550e8400-e29b-41d4-a716-446655440010';
const checklistId = '550e8400-e29b-41d4-a716-446655440020';
const taskId = '550e8400-e29b-41d4-a716-446655440050';
const tripId = '550e8400-e29b-41d4-a716-446655440060';
const stopId = '550e8400-e29b-41d4-a716-446655440061';
const runId = '550e8400-e29b-41d4-a716-446655440040';
const logEntryId = '550e8400-e29b-41d4-a716-446655440070';

function owner(name: string): Owner {
  return { id: ownerId, email: 'owner@example.com', name };
}

function rig(nickname: string): Rig {
  return { id: rigId, ownerId, nickname };
}

function task(name: string): MaintenanceTask {
  return { id: taskId, rigId, name, fieldSchema: [], tags: [] };
}

function logEntry(taskName: string): LogEntry {
  return {
    id: logEntryId,
    taskId,
    rigId,
    taskName,
    performedOn: '2026-07-20',
    fields: [],
  };
}

function checklist(name: string): Checklist {
  return { id: checklistId, rigId, name, tags: [], steps: [] };
}

function run(startedOn: string): Run {
  return { id: runId, checklistId, rigId, tripId, startedOn, steps: [] };
}

/** The ticket's repro shape: fresh = the stop is arrived, stale = it is not. */
function trip(hasArrived: boolean): TripRead {
  return {
    id: tripId,
    rigId,
    name: 'Fall loop',
    checklistIds: [],
    status: hasArrived ? 'completed' : 'planned',
    stops: [
      { id: stopId, tripId, position: 0, arrived: hasArrived, attachments: [] },
    ],
  };
}

interface GuardCase {
  readonly name: string;
  readonly prefix: string;
  readonly seedFresh: (store: AppStore) => void;
  readonly seedStale: (store: AppStore) => void;
  readonly fresh: unknown;
}

const cases: GuardCase[] = [
  {
    name: 'seedMe',
    prefix: 'me(',
    seedFresh: (s) => {
      seedMe(s, owner('Fresh'));
    },
    seedStale: (s) => {
      seedMe(s, owner('Stale'));
    },
    fresh: owner('Fresh'),
  },
  {
    name: 'seedRigs',
    prefix: 'listRigs(',
    seedFresh: (s) => {
      seedRigs(s, [rig('Fresh')]);
    },
    seedStale: (s) => {
      seedRigs(s, [rig('Stale')]);
    },
    fresh: [rig('Fresh')],
  },
  {
    name: 'seedTasks',
    prefix: 'listTasks(',
    seedFresh: (s) => {
      seedTasks(s, rigId, [task('Fresh')]);
    },
    seedStale: (s) => {
      seedTasks(s, rigId, [task('Stale')]);
    },
    fresh: [task('Fresh')],
  },
  {
    name: 'seedLogEntriesByRig',
    prefix: 'listLogEntriesByRig(',
    seedFresh: (s) => {
      seedLogEntriesByRig(s, rigId, [logEntry('Fresh')]);
    },
    seedStale: (s) => {
      seedLogEntriesByRig(s, rigId, [logEntry('Stale')]);
    },
    fresh: [logEntry('Fresh')],
  },
  {
    name: 'seedChecklists',
    prefix: 'listChecklists(',
    seedFresh: (s) => {
      seedChecklists(s, rigId, [checklist('Fresh')]);
    },
    seedStale: (s) => {
      seedChecklists(s, rigId, [checklist('Stale')]);
    },
    fresh: [checklist('Fresh')],
  },
  {
    name: 'seedRun',
    prefix: 'getRun(',
    seedFresh: (s) => {
      seedRun(s, runId, run('2026-07-21'));
    },
    seedStale: (s) => {
      seedRun(s, runId, run('2026-07-20'));
    },
    fresh: run('2026-07-21'),
  },
  {
    name: 'seedRunsByRig',
    prefix: 'listRunsByRig(',
    seedFresh: (s) => {
      seedRunsByRig(s, rigId, [run('2026-07-21')]);
    },
    seedStale: (s) => {
      seedRunsByRig(s, rigId, [run('2026-07-20')]);
    },
    fresh: [run('2026-07-21')],
  },
  {
    name: 'seedRunsByTrip',
    prefix: 'listRunsByTrip(',
    seedFresh: (s) => {
      seedRunsByTrip(s, tripId, [run('2026-07-21')]);
    },
    seedStale: (s) => {
      seedRunsByTrip(s, tripId, [run('2026-07-20')]);
    },
    fresh: [run('2026-07-21')],
  },
  {
    name: 'seedTrips',
    prefix: 'listTripsByRig(',
    seedFresh: (s) => {
      seedTrips(s, rigId, [trip(true)]);
    },
    seedStale: (s) => {
      seedTrips(s, rigId, [trip(false)]);
    },
    fresh: [trip(true)],
  },
];

describe('seed-cache guard (issue #134)', () => {
  afterEach(() => {
    for (const store of stores) store.dispatch(api.util.resetApiState());
    stores.length = 0;
    localStorage.clear();
  });

  describe.each(cases)('$name', ({ prefix, seedFresh, seedStale, fresh }) => {
    it('seeds an empty store', async () => {
      const store = trackedStore();

      seedFresh(store);
      await settle();

      expect(queryData(store, prefix)).toEqual(fresh);
    });

    it('does not replace a fulfilled entry', async () => {
      const store = trackedStore();
      seedFresh(store);
      await settle();

      seedStale(store);
      await settle();

      expect(queryData(store, prefix)).toEqual(fresh);
    });
  });

  it('still seeds over a rejected entry', async () => {
    const store = trackedStore();
    await store.dispatch(api.endpoints.listTripsByRig.initiate(rigId));
    expect(
      api.endpoints.listTripsByRig.select(rigId)(store.getState()).isError,
    ).toBe(true);

    seedTrips(store, rigId, [trip(true)]);
    await settle();

    expect(queryData(store, 'listTripsByRig(')).toEqual([trip(true)]);
  });
});

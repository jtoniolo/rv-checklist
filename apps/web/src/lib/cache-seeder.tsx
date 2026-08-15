'use client';

import type {
  Checklist,
  Id,
  LogEntry,
  MaintenanceTask,
  Owner,
  Rig,
  Run,
} from '@rv-checklist/domain';
import {
  seedChecklists,
  seedLogEntriesByRig,
  seedMe,
  seedRigs,
  seedRunsByRig,
  seedSignedIn,
  seedTasks,
  useAppStore,
} from '@rv-checklist/web-data-access';
import { useRef, type JSX, type ReactNode } from 'react';

/**
 * Seed server-fetched data into the RTK Query cache (ADR-0018 — Pattern C).
 *
 * Dispatched synchronously during the first render so child hooks read
 * populated cache entries on both server (SSR) and client (hydration).
 * Each prop is optional — omit what the current page doesn't need.
 */
export interface CacheSeedProps {
  readonly me?: Owner;
  readonly rigs?: Rig[];
  readonly tasks?: { readonly rigId: Id; readonly data: MaintenanceTask[] };
  readonly logEntries?: {
    readonly rigId: Id;
    readonly data: LogEntry[];
  };
  readonly checklists?: { readonly rigId: Id; readonly data: Checklist[] };
  readonly runsByRig?: { readonly rigId: Id; readonly data: Run[] };
  readonly children: ReactNode;
}

export function CacheSeeder({
  me,
  rigs,
  tasks,
  logEntries,
  checklists,
  runsByRig,
  children,
}: CacheSeedProps): JSX.Element {
  const store = useAppStore();
  const seeded = useRef(false);

  if (!seeded.current) {
    seeded.current = true;
    seedSignedIn(store);
    if (me !== undefined) {
      seedMe(store, me);
    }
    if (rigs !== undefined) {
      seedRigs(store, rigs);
    }
    if (tasks !== undefined) {
      seedTasks(store, tasks.rigId, tasks.data);
    }
    if (logEntries !== undefined) {
      seedLogEntriesByRig(store, logEntries.rigId, logEntries.data);
    }
    if (checklists !== undefined) {
      seedChecklists(store, checklists.rigId, checklists.data);
    }
    if (runsByRig !== undefined) {
      seedRunsByRig(store, runsByRig.rigId, runsByRig.data);
    }
  }

  return <>{children}</>;
}

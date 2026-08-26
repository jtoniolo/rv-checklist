'use client';

import { observeSyncReconnect } from '@rv-checklist/web-data-access';
import { useEffect, useRef } from 'react';
import { previousPlaceIn, type Placed } from './leg-recalc';

/**
 * Re-runs the auto-fill leg guards on reconnect (issue #154, ADR-0028): once
 * the sync client regains a connection it had lost — after whatever queued
 * offline has had a chance to replay through the write queue (#147) — every
 * current item is offered to `fill` with the place ID its leg now starts
 * from, in order. `fill` itself enforces ADR-0025's guards (never a manually
 * typed leg, never an arrived stop, never an un-placed end) — this hook only
 * decides *when* to ask again, not *what* may be written, so it works for
 * both the trip editor's persisted stops and any future draft-backed caller.
 *
 * Subscribes once per mount, not on every items/start change: a ref carries
 * the latest values so a reconnect always sees the current list without
 * tearing down and reopening the sync connection on every render.
 */
export function useReconnectLegRefetch<T extends Placed>({
  items,
  startPlaceId,
  fill,
  subscribe = observeSyncReconnect,
}: {
  readonly items: readonly T[];
  readonly startPlaceId: string | undefined;
  readonly fill: (item: T, fromPlaceId: string | undefined) => Promise<void>;
  readonly subscribe?: (notify: () => void) => () => void;
}): void {
  const latest = useRef({ items, startPlaceId, fill });
  latest.current = { items, startPlaceId, fill };

  useEffect(() => {
    return subscribe(() => {
      const { items: current, startPlaceId: start, fill: run } = latest.current;
      void Promise.all(
        current.map((item, index) =>
          run(item, previousPlaceIn(current, index, start)),
        ),
      );
    });
    // `latest` carries items/startPlaceId/fill — only `subscribe` belongs here.
  }, [subscribe]);
}

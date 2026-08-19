import {
  currentTrip,
  dueStatusOf,
  type DueStatus,
  type Id,
  type TripRead,
} from '@rv-checklist/domain';
import { StatusChip } from '@rv-checklist/web-ui';
import Link from 'next/link';
import type { JSX } from 'react';
import { formatIsoDate, todayIso } from '../../dates';
import { CacheSeeder } from '@/lib/cache-seeder';
import {
  fetchLogEntriesByRig,
  fetchMe,
  fetchRigs,
  fetchTasks,
  fetchTripsByRig,
} from '@/lib/server-api';

/**
 * The rig home/dashboard page (ADR-0018 — Pattern C tracer bullet). An async
 * server component that fetches tasks, log entries, and trips, renders
 * due/overdue maintenance tasks and the current-trip card (issue #118)
 * directly into the HTML, and seeds the RTK Query cache so client components
 * downstream never double-fetch.
 *
 * AC1: the HTML contains the owner's data (view-source proof, no spinner).
 * AC2: CacheSeeder populates hooks for any client components on the page.
 */
export default async function RigHomePage({
  params,
}: {
  readonly params: Promise<{ rigId: string }>;
}): Promise<JSX.Element> {
  const { rigId } = await params;
  const [me, rigs, tasks, logEntries, trips] = await Promise.all([
    fetchMe(),
    fetchRigs(),
    fetchTasks(rigId),
    fetchLogEntriesByRig(rigId),
    fetchTripsByRig(rigId),
  ]);

  const rig = rigs.find((r) => r.id === rigId);
  const current = findCurrentTrip(trips);
  const firstName = me.name?.trim().split(/\s+/, 1)[0];
  const today = todayIso();

  const taskStatuses = tasks.map((task) => ({
    task,
    status: dueStatusOf(
      task,
      logEntries.filter((e) => e.taskId === task.id),
      rig?.distanceKm,
      today,
    ),
  }));

  const attentionKinds = new Set(['due', 'overdue', 'one-time']);
  const needsAttention = taskStatuses.filter(({ status }) =>
    attentionKinds.has(status.kind),
  );

  return (
    <CacheSeeder
      tasks={{ rigId, data: tasks }}
      logEntries={{ rigId, data: logEntries }}
      trips={{ rigId, data: trips }}
    >
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight text-brand lg:text-3xl dark:text-ink-inverted">
          {firstName ? `Hi ${firstName}` : 'Welcome back'}
        </h1>

        {rig ? (
          <p className="text-sm text-brand-muted">
            Dashboard for {rig.nickname}
          </p>
        ) : undefined}

        {current ? (
          <section className="flex flex-col gap-3" aria-label="Current trip">
            <h2 className="text-sm font-semibold tracking-wide text-brand-muted uppercase">
              Current trip
            </h2>
            <CurrentTripCard rigId={rigId} trip={current} />
          </section>
        ) : undefined}

        {needsAttention.length > 0 ? (
          <section className="flex flex-col gap-3" aria-label="Needs attention">
            <h2 className="text-sm font-semibold tracking-wide text-brand-muted uppercase">
              Needs attention
            </h2>
            <ul className="flex flex-col divide-y divide-hairline">
              {needsAttention.map(({ task, status }) => (
                <li key={task.id}>
                  <Link
                    href={`/rig/${rigId}/maintenance/${task.id}`}
                    className="flex w-full items-center gap-3 py-3 text-left hover:bg-hairline/30"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate font-medium text-brand dark:text-ink-inverted">
                        {task.name}
                      </span>
                      <DueBadge status={status} />
                    </span>
                    <span aria-hidden className="shrink-0 text-brand-muted">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
            Everything is up to date.
          </p>
        )}

        {tasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
            No maintenance tasks yet — add the first one to track when things
            are due.
          </p>
        ) : undefined}
      </div>
    </CacheSeeder>
  );
}

/**
 * The domain's `currentTrip` over `TripRead`s. The adapter only narrows each
 * stop to the fields the helper reads (`exactOptionalPropertyTypes` rejects
 * the wider Zod-inferred stop shape directly).
 */
function findCurrentTrip(trips: readonly TripRead[]): TripRead | undefined {
  return currentTrip(
    trips.map((trip) => ({
      trip,
      stops: trip.stops.map((s) => ({
        position: s.position,
        arrived: s.arrived,
        ...(s.arrivalDate !== undefined && { arrivalDate: s.arrivalDate }),
      })),
    })),
  )?.trip;
}

/**
 * The current-trip card (issue #118): name, status chip, and the next stop —
 * the first un-arrived stop in travel order — with its arrival date. One tap
 * from landing to the trip's arrival dashboard.
 */
function CurrentTripCard({
  rigId,
  trip,
}: {
  readonly rigId: Id;
  readonly trip: TripRead;
}): JSX.Element {
  const nextStop = trip.stops
    .toSorted((a, b) => a.position - b.position)
    .find((s) => !s.arrived);
  return (
    <Link
      href={`/rig/${rigId}/trips/${trip.id}`}
      className="flex w-full items-center gap-3 rounded-xl border border-hairline p-4 text-left hover:bg-hairline/30"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium text-brand dark:text-ink-inverted">
          {trip.name}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-brand-muted">
          <StatusChip status={trip.status} />
          {nextStop ? (
            <span>
              Next: {nextStop.campground ?? 'Unnamed stop'}
              {nextStop.arrivalDate === undefined
                ? ''
                : ` · ${formatIsoDate(nextStop.arrivalDate)}`}
            </span>
          ) : undefined}
        </span>
      </span>
      <span aria-hidden className="shrink-0 text-brand-muted">
        ›
      </span>
    </Link>
  );
}

const ATTENTION_TONE =
  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
const OVERDUE_TONE =
  'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';

function badgeOf(status: DueStatus): readonly [string, string] | undefined {
  switch (status.kind) {
    case 'one-time': {
      return ['To do', ATTENTION_TONE];
    }
    case 'due': {
      return status.basis === 'distance'
        ? [
            `Due now — at ${status.dueAtKm.toLocaleString('en-US')} km`,
            ATTENTION_TONE,
          ]
        : ['Due today', ATTENTION_TONE];
    }
    case 'overdue': {
      return status.basis === 'distance'
        ? [
            `Overdue — due at ${status.dueAtKm.toLocaleString('en-US')} km`,
            OVERDUE_TONE,
          ]
        : [`Overdue — ${formatIsoDate(status.dueOn)}`, OVERDUE_TONE];
    }
    default: {
      return undefined;
    }
  }
}

function DueBadge({
  status,
}: {
  readonly status: DueStatus;
}): JSX.Element | undefined {
  const badge = badgeOf(status);
  if (badge === undefined) {
    return undefined;
  }
  const [text, tone] = badge;
  return (
    <span
      className={`self-start rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {text}
    </span>
  );
}

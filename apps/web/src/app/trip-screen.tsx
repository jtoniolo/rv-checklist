'use client';

import {
  runProgress,
  type Checklist,
  type Id,
  type Run,
  type StopRead,
  type TripRead,
} from '@rv-checklist/domain';
import {
  useCreateRunMutation,
  useListChecklistsQuery,
  useListRunsByTripQuery,
  useListTripsByRigQuery,
  useSetStopArrivedMutation,
  useUpdateTripMutation,
} from '@rv-checklist/web-data-access';
import { fractionDone, ProgressBar, StatusChip } from '@rv-checklist/web-ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type JSX, type ReactNode } from 'react';
import { formatIsoDate } from './dates';

// ── Derivations ─────────────────────────────────────────────────────────────

/** The trip's stops in travel order (the payload order is not guaranteed). */
function orderedStops(trip: TripRead): StopRead[] {
  return trip.stops.toSorted((a, b) => a.position - b.position);
}

function totalKm(stops: readonly StopRead[]): number {
  return stops.reduce((sum, s) => sum + (s.legKm ?? 0), 0);
}

function formatKm(km: number): string {
  return `${km.toLocaleString('en-US')} km`;
}

/** Cents → dollars for display (the house cents pattern, see `log-entry.ts`). */
function formatCost(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * The stop's **navigation link** — the Google Maps directions URL built from
 * its place reference, driving the rig *to* the stop. Not the campground map
 * (which orients the owner *within* the grounds — CONTEXT.md, never conflate
 * the two). Only a stop with a place ID gets one.
 */
function navigationUrl(stop: StopRead): string | undefined {
  if (stop.placeId === undefined) {
    return undefined;
  }
  const destination = encodeURIComponent(stop.campground ?? stop.address ?? '');
  return `https://www.google.com/maps/dir/?api=1&destination=${destination}&destination_place_id=${stop.placeId}`;
}

// ── Screen ──────────────────────────────────────────────────────────────────

/**
 * The trip screen (issue #116) — an arrival-first dashboard. The next
 * un-arrived stop's card is the hero: everything needed at the campground gate
 * in one glance, with the arrival action and the trip's checklists right on
 * the card. Below it, the trip's runs as progress cards and the compact route
 * list. A completed trip swaps the hero for a summary.
 */
export function TripScreen({
  rigId,
  tripId,
}: {
  readonly rigId: Id;
  readonly tripId: Id;
}): JSX.Element {
  const router = useRouter();
  const { data: trips, isLoading, isError } = useListTripsByRigQuery(rigId);
  const { data: checklists } = useListChecklistsQuery(rigId);
  const { data: runs } = useListRunsByTripQuery(tripId);
  const [setStopArrived, { isLoading: isArriving }] =
    useSetStopArrivedMutation();
  const [updateTrip, { isLoading: isSavingLinks }] = useUpdateTripMutation();
  const [createRun, { isLoading: isStarting }] = useCreateRunMutation();

  if (isLoading) {
    return <p className="text-brand-muted">Loading trip…</p>;
  }
  if (isError) {
    return (
      <p className="text-red-600 dark:text-red-400" role="alert">
        Couldn&apos;t load this trip. Please try again.
      </p>
    );
  }

  const trip = trips?.find((t) => t.id === tripId);
  if (trip === undefined) {
    return (
      <p className="text-red-600 dark:text-red-400" role="alert">
        This trip no longer exists.
      </p>
    );
  }

  const stops = orderedStops(trip);
  const nextStop = stops.find((s) => !s.arrived);
  const lastArrived = stops.findLast((s) => s.arrived);

  const setArrived = (stopId: Id, isArrived: boolean): void => {
    void setStopArrived({ id: stopId, arrived: isArrived, rigId, tripId });
  };

  const startRun = async (checklistId: Id): Promise<void> => {
    const run = await createRun({ checklistId, tripId }).unwrap();
    router.push(`/rig/${rigId}/runs/${run.id}`);
  };

  // Rendered inside the hero (Variant B — checklists live on the card) and
  // after the summary once the trip is completed.
  const checklistSection = (
    <TripChecklists
      trip={trip}
      checklists={checklists ?? []}
      starting={isStarting}
      saving={isSavingLinks}
      onStartRun={(checklistId) => void startRun(checklistId)}
      onSetLinks={(checklistIds) =>
        void updateTrip({ id: tripId, rigId, changes: { checklistIds } })
      }
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{trip.name}</h1>
            <StatusChip status={trip.status} />
          </div>
          {trip.startLocation === undefined ? undefined : (
            <p className="text-sm text-brand-muted">
              From {trip.startLocation}
            </p>
          )}
        </div>
        <Link
          href={`/rig/${rigId}/trips/${tripId}/edit`}
          className="shrink-0 rounded-md border border-hairline px-3 py-1.5 text-sm font-medium text-brand hover:border-brand dark:text-ink-inverted"
        >
          Edit trip
        </Link>
      </header>

      {nextStop === undefined ? (
        <>
          {stops.length === 0 ? (
            <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
              No stops yet — add the route in the trip editor.
            </p>
          ) : (
            <CompletedSummary stops={stops} />
          )}
          {checklistSection}
        </>
      ) : (
        <NextStopHero
          stop={nextStop}
          arriving={isArriving}
          lastArrived={lastArrived}
          onArrive={() => {
            setArrived(nextStop.id, true);
          }}
          onUndo={(stopId) => {
            setArrived(stopId, false);
          }}
        >
          {checklistSection}
        </NextStopHero>
      )}

      <TripRuns rigId={rigId} runs={runs} checklists={checklists ?? []} />

      <RouteList
        trip={trip}
        stops={stops}
        onUndo={(stopId) => {
          setArrived(stopId, false);
        }}
      />
    </div>
  );
}

// ── Next-stop hero ──────────────────────────────────────────────────────────

/**
 * The hero card for the next un-arrived stop — the one-stop shop at arrival
 * (CONTEXT.md — Stop). Unset fields are simply absent. A distinct component so
 * the attachments section (issue #117) can slot in without reshaping the
 * screen. `children` carries the checklist chips onto the card.
 */
function NextStopHero({
  stop,
  arriving,
  lastArrived,
  onArrive,
  onUndo,
  children,
}: {
  readonly stop: StopRead;
  readonly arriving: boolean;
  readonly lastArrived: StopRead | undefined;
  readonly onArrive: () => void;
  readonly onUndo: (stopId: Id) => void;
  readonly children: ReactNode;
}): JSX.Element {
  const nav = navigationUrl(stop);
  return (
    <section
      aria-label="Next stop"
      className="flex flex-col gap-4 rounded-xl border-2 border-brand p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-brand-muted uppercase">
            Next stop
            {stop.arrivalDate === undefined
              ? ''
              : ` · ${formatIsoDate(stop.arrivalDate)}`}
          </p>
          <h2 className="text-xl font-semibold">
            {stop.campground ?? 'Unnamed stop'}
          </h2>
        </div>
        {stop.legKm === undefined ? undefined : (
          <span className="shrink-0 text-sm text-brand-muted">
            {formatKm(stop.legKm)} drive
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <HeroFact label="Site" value={stop.campsite} />
        <HeroFact label="Check-in" value={stop.checkInTime} />
        <HeroFact label="Check-out" value={stop.checkOutTime} />
        <HeroFact
          label="Nights"
          value={stop.nights === undefined ? undefined : String(stop.nights)}
        />
        <HeroFact label="Booking #" value={stop.bookingNumber} />
        <HeroFact
          label="Cost"
          value={
            stop.costCents === undefined
              ? undefined
              : formatCost(stop.costCents)
          }
        />
      </div>

      {nav === undefined ? undefined : (
        <a
          href={nav}
          target="_blank"
          rel="noreferrer"
          className="self-start rounded-md border border-hairline px-3 py-1.5 text-sm font-medium text-brand hover:border-brand dark:text-ink-inverted"
        >
          Navigate to this stop
        </a>
      )}

      {stop.address === undefined ? undefined : (
        <p className="text-sm">
          <span className="text-brand-muted">Address · </span>
          {stop.address}
        </p>
      )}
      {stop.phone === undefined ? undefined : (
        <p className="text-sm">
          <span className="text-brand-muted">Phone · </span>
          <a className="underline" href={`tel:${stop.phone}`}>
            {stop.phone}
          </a>
        </p>
      )}
      {stop.notes === undefined ? undefined : (
        <p className="rounded-md bg-hairline/30 p-3 text-sm">{stop.notes}</p>
      )}

      <button
        type="button"
        disabled={arriving}
        onClick={onArrive}
        className="rounded-md bg-brand px-4 py-3 text-base font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        Mark arrived
        {stop.legKm === undefined ? '' : ` (+${formatKm(stop.legKm)})`}
      </button>

      {lastArrived === undefined ? undefined : (
        <button
          type="button"
          disabled={arriving}
          onClick={() => {
            onUndo(lastArrived.id);
          }}
          className="self-start text-xs text-brand-muted underline hover:text-brand dark:hover:text-ink-inverted"
        >
          Undo arrival at {lastArrived.campground ?? 'the previous stop'}
        </button>
      )}

      {children}
    </section>
  );
}

/** One labelled hero field — rendered only when the stop carries a value. */
function HeroFact({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | undefined;
}): JSX.Element | undefined {
  if (value === undefined) {
    return undefined;
  }
  return (
    <div>
      <p className="text-xs text-brand-muted">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

// ── Completed summary ───────────────────────────────────────────────────────

/** The compact summary a completed trip shows in place of the hero. */
function CompletedSummary({
  stops,
}: {
  readonly stops: readonly StopRead[];
}): JSX.Element {
  const first = stops.find((s) => s.arrivalDate !== undefined)?.arrivalDate;
  const last = stops.findLast((s) => s.arrivalDate !== undefined)?.arrivalDate;
  return (
    <section
      aria-label="Trip summary"
      className="flex flex-col gap-1 rounded-xl border border-hairline p-5 text-center"
    >
      <p className="text-lg font-semibold">Trip completed</p>
      <p className="text-sm text-brand-muted">
        {first !== undefined && last !== undefined
          ? `${formatIsoDate(first)} – ${formatIsoDate(last)} · `
          : ''}
        {formatKm(totalKm(stops))} across {String(stops.length)}{' '}
        {stops.length === 1 ? 'stop' : 'stops'}
      </p>
    </section>
  );
}

// ── Checklists on the trip ──────────────────────────────────────────────────

/**
 * The trip's linked checklists as chips — a tap starts a run linked to this
 * trip (copy-on-start, like the checklist screen). "Manage checklists" flips
 * to the rig's full set as toggles; each toggle replaces the whole
 * `checklistIds` set (the link has no metadata — ADR-0017's reasoning).
 */
function TripChecklists({
  trip,
  checklists,
  starting,
  saving,
  onStartRun,
  onSetLinks,
}: {
  readonly trip: TripRead;
  readonly checklists: readonly Checklist[];
  readonly starting: boolean;
  readonly saving: boolean;
  readonly onStartRun: (checklistId: Id) => void;
  readonly onSetLinks: (checklistIds: Id[]) => void;
}): JSX.Element {
  const [managing, setManaging] = useState(false);
  const linked = trip.checklistIds
    .map((id) => checklists.find((c) => c.id === id))
    .filter((c): c is Checklist => c !== undefined);

  const toggle = (checklistId: Id): void => {
    onSetLinks(
      trip.checklistIds.includes(checklistId)
        ? trip.checklistIds.filter((id) => id !== checklistId)
        : [...trip.checklistIds, checklistId],
    );
  };

  return (
    <div className="flex flex-col gap-2 border-t border-hairline pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-brand-muted uppercase">
          Checklists
        </p>
        <button
          type="button"
          onClick={() => {
            setManaging((open) => !open);
          }}
          className="text-xs font-medium text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
        >
          {managing ? 'Done' : 'Manage checklists'}
        </button>
      </div>

      {managing ? (
        <div className="flex flex-wrap gap-2">
          {checklists.length === 0 ? (
            <p className="text-sm text-brand-muted">
              This rig has no checklists yet.
            </p>
          ) : (
            checklists.map((checklist) => {
              const isLinked = trip.checklistIds.includes(checklist.id);
              return (
                <button
                  key={checklist.id}
                  type="button"
                  aria-pressed={isLinked}
                  disabled={saving}
                  onClick={() => {
                    toggle(checklist.id);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                    isLinked
                      ? 'border-brand bg-brand text-white'
                      : 'border-hairline text-brand-muted hover:border-brand'
                  }`}
                >
                  {checklist.name}
                </button>
              );
            })
          )}
        </div>
      ) : linked.length === 0 ? (
        <p className="text-sm text-brand-muted">
          No checklists linked to this trip.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {linked.map((checklist) => (
            <button
              key={checklist.id}
              type="button"
              disabled={starting}
              onClick={() => {
                onStartRun(checklist.id);
              }}
              className="rounded-full border border-hairline px-3 py-1 text-xs font-medium text-brand hover:border-brand disabled:opacity-50 dark:text-ink-inverted"
            >
              {checklist.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Runs on this trip ───────────────────────────────────────────────────────

/** The trip's runs as progress cards, each linking into the run screen. */
function TripRuns({
  rigId,
  runs,
  checklists,
}: {
  readonly rigId: Id;
  readonly runs: readonly Run[] | undefined;
  readonly checklists: readonly Checklist[];
}): JSX.Element {
  return (
    <section aria-label="Runs on this trip" className="flex flex-col gap-2">
      <h2 className="text-sm font-medium tracking-wide text-brand-muted uppercase">
        Runs on this trip
      </h2>
      {runs?.length === 0 ? (
        <p className="text-sm text-brand-muted">
          No runs yet — tap a checklist on the card to start one.
        </p>
      ) : undefined}
      <ul className="flex flex-col gap-2">
        {runs?.map((run) => {
          const progress = runProgress(run);
          const name =
            checklists.find((c) => c.id === run.checklistId)?.name ??
            'Checklist';
          return (
            <li key={run.id}>
              <Link
                href={`/rig/${rigId}/runs/${run.id}`}
                className="flex flex-col gap-2 rounded-lg border border-hairline p-3 hover:bg-hairline/30"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-brand dark:text-ink-inverted">
                    {name}
                  </span>
                  <span className="text-sm text-brand-muted">
                    {progress.inProgress
                      ? `${String(progress.completed + progress.skipped)} of ${String(progress.total)}`
                      : 'Done'}
                  </span>
                </div>
                <span className="text-xs text-brand-muted">
                  Started {formatIsoDate(run.startedOn)}
                </span>
                <ProgressBar value={fractionDone(progress)} />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Route list ──────────────────────────────────────────────────────────────

/**
 * The compact route: the trip's start point on top, then the ordered stops
 * with arrival date and leg km. Arrived stops are checked and dimmed, each
 * with an undo.
 */
function RouteList({
  trip,
  stops,
  onUndo,
}: {
  readonly trip: TripRead;
  readonly stops: readonly StopRead[];
  readonly onUndo: (stopId: Id) => void;
}): JSX.Element {
  return (
    <section aria-label="Route" className="flex flex-col gap-2">
      <h2 className="text-sm font-medium tracking-wide text-brand-muted uppercase">
        Route · {formatKm(totalKm(stops))} total
      </h2>
      <ol className="divide-y divide-hairline rounded-lg border border-hairline">
        {trip.startLocation === undefined ? undefined : (
          <li className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span
              aria-hidden
              className="w-5 text-center font-semibold text-brand-muted"
            >
              ○
            </span>
            <span className="flex-1 text-brand-muted">
              {trip.startLocation}
            </span>
            <span className="text-xs text-brand-muted">Start</span>
          </li>
        )}
        {stops.map((stop, i) => (
          <li
            key={stop.id}
            className={`flex items-center gap-3 px-4 py-2.5 text-sm ${
              stop.arrived ? 'opacity-60' : ''
            }`}
          >
            <span
              aria-hidden
              className="w-5 text-center font-semibold text-brand-muted"
            >
              {stop.arrived ? '✓' : String(i + 1)}
            </span>
            <span className="flex-1">
              {stop.campground ?? `Stop ${String(i + 1)}`}
              {stop.arrived ? (
                <button
                  type="button"
                  aria-label={`Undo arrival at ${stop.campground ?? `stop ${String(i + 1)}`}`}
                  onClick={() => {
                    onUndo(stop.id);
                  }}
                  className="ml-2 text-xs text-brand-muted underline hover:text-brand dark:hover:text-ink-inverted"
                >
                  Undo
                </button>
              ) : undefined}
            </span>
            <span className="text-brand-muted">
              {stop.arrivalDate === undefined
                ? ''
                : formatIsoDate(stop.arrivalDate)}
            </span>
            <span className="w-16 text-right text-brand-muted">
              {stop.legKm === undefined ? '' : formatKm(stop.legKm)}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

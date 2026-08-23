'use client';

import {
  findCurrentTrip,
  type Id,
  type TripRead,
  type TripStatus,
} from '@rv-checklist/domain';
import { useListTripsByRigQuery } from '@rv-checklist/web-data-access';
import { ListEmpty, StatusChip } from '@rv-checklist/web-ui';
import Link from 'next/link';
import { useMemo, useState, type JSX } from 'react';

const STATUSES: readonly TripStatus[] = ['planned', 'underway', 'completed'];

// ── Row derivations (dates from first/last stop, km from legs) ─────────────

/** A trip's start date — its first dated stop's arrival (stops arrive in travel order). */
function startDate(trip: TripRead): string | undefined {
  return trip.stops.find((s) => s.arrivalDate !== undefined)?.arrivalDate;
}

/** A trip's end date — its last dated stop's arrival. */
function endDate(trip: TripRead): string | undefined {
  return trip.stops.findLast((s) => s.arrivalDate !== undefined)?.arrivalDate;
}

function totalKm(trip: TripRead): number {
  return trip.stops.reduce((sum, s) => sum + (s.legKm ?? 0), 0);
}

/** "Sep 18" — short day label for the near end of a range. */
function fmtDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

/** "Sep 20, 2026" — full date label. */
function fmtFull(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function dateRange(trip: TripRead): string {
  const start = startDate(trip);
  const end = endDate(trip);
  if (start === undefined || end === undefined) return 'Dates TBD';
  if (start === end) return fmtFull(start);
  if (start.slice(0, 4) === end.slice(0, 4)) {
    return `${fmtDay(start)} – ${fmtFull(end)}`;
  }
  return `${fmtFull(start)} – ${fmtFull(end)}`;
}

// ── The fixed order (issue #108 resolution) ─────────────────────────────────

/**
 * One fixed order, no sort control: the current trip pinned on top (domain
 * `currentTrip` — never re-derived here), any other underway trips, planned
 * trips by start date (undated last), then completed trips newest-first.
 */
function orderTrips(trips: readonly TripRead[]): TripRead[] {
  const current = findCurrentTrip(trips);
  const rest = trips.filter((t) => t !== current);
  const underway = rest.filter((t) => t.status === 'underway');
  const planned = rest
    .filter((t) => t.status === 'planned')
    .toSorted((a, b) =>
      (startDate(a) ?? '9999').localeCompare(startDate(b) ?? '9999'),
    );
  const completed = rest
    .filter((t) => t.status === 'completed')
    .toSorted((a, b) => (endDate(b) ?? '').localeCompare(endDate(a) ?? ''));
  return [
    ...(current === undefined ? [] : [current]),
    ...underway,
    ...planned,
    ...completed,
  ];
}

/** A run of rows under one optional heading (a year, for completed trips). */
interface TripSection {
  readonly heading?: string;
  readonly trips: TripRead[];
}

function toSections(
  trips: readonly TripRead[],
  selected: readonly TripStatus[],
): TripSection[] {
  const visible = orderTrips(trips).filter(
    (t) => selected.length === 0 || selected.includes(t.status),
  );
  const upcoming = visible.filter((t) => t.status !== 'completed');
  const completed = visible.filter((t) => t.status === 'completed');
  const sections: TripSection[] =
    upcoming.length > 0 ? [{ trips: upcoming }] : [];
  for (const trip of completed) {
    const year = endDate(trip)?.slice(0, 4) ?? 'Earlier';
    const last = sections.at(-1);
    if (last?.heading === year) {
      last.trips.push(trip);
    } else {
      sections.push({ heading: year, trips: [trip] });
    }
  }
  return sections;
}

// ── Screen ──────────────────────────────────────────────────────────────────

export function TripsScreen({ rigId }: { readonly rigId: Id }): JSX.Element {
  const { data: trips, isLoading, isError } = useListTripsByRigQuery(rigId);
  const [selected, setSelected] = useState<TripStatus[]>([]);

  const sections = useMemo(
    () => toSections(trips ?? [], selected),
    [trips, selected],
  );
  const shown = sections.reduce((n, s) => n + s.trips.length, 0);

  const toggleStatus = (status: TripStatus): void => {
    setSelected((current) =>
      current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status],
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-[3.25rem] z-10 -mx-4 flex items-center justify-between gap-3 border-b border-hairline bg-surface/95 px-4 pt-3 pb-3 backdrop-blur lg:top-[3.5rem] lg:-mx-6 lg:px-6 dark:bg-surface-dark/95">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUSES.map((status) => (
            <StatusChip
              key={status}
              status={status}
              selected={selected.includes(status)}
              onClick={() => {
                toggleStatus(status);
              }}
            />
          ))}
        </div>
        <Link
          href={`/rig/${rigId}/trips/new`}
          className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          New trip
        </Link>
      </div>

      {isLoading ? (
        <p className="text-brand-muted">Loading trips…</p>
      ) : undefined}
      {isError ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          Couldn&apos;t load trips. Please try again.
        </p>
      ) : undefined}
      {!isLoading && trips?.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
          No trips yet — plan your first one for this rig.
        </p>
      ) : undefined}

      {sections.map((section) => (
        <section
          key={section.heading ?? 'upcoming'}
          className="flex flex-col gap-1"
        >
          {section.heading === undefined ? undefined : (
            <h2 className="text-sm font-semibold text-brand-muted">
              {section.heading}
            </h2>
          )}
          <ul className="flex flex-col divide-y divide-hairline">
            {section.trips.map((trip) => (
              <li key={trip.id}>
                <TripRow rigId={rigId} trip={trip} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {shown === 0 && (trips?.length ?? 0) > 0 ? (
        <ListEmpty message="No trips match." />
      ) : undefined}
    </div>
  );
}

// ── Trip list row ───────────────────────────────────────────────────────────

function TripRow({
  rigId,
  trip,
}: {
  readonly rigId: Id;
  readonly trip: TripRead;
}): JSX.Element {
  const stopCount = trip.stops.length;
  return (
    <Link
      href={`/rig/${rigId}/trips/${trip.id}`}
      className="flex w-full items-center gap-3 py-3 text-left hover:bg-hairline/30"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-medium text-brand dark:text-ink-inverted">
          {trip.name}
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-brand-muted">
          <StatusChip status={trip.status} />
          <span>
            · {dateRange(trip)} · {stopCount}{' '}
            {stopCount === 1 ? 'stop' : 'stops'} ·{' '}
            {totalKm(trip).toLocaleString('en-US')} km
          </span>
        </span>
      </span>
      <span aria-hidden className="shrink-0 text-brand-muted">
        ›
      </span>
    </Link>
  );
}

'use client';

import { Button } from '@rv-checklist/web-ui';
import { useState, type JSX } from 'react';
import {
  formatCost,
  formatDate,
  formatKm,
  loggedKm,
  StatusBadge,
  totalKm,
  tripStatus,
  type ProtoStop,
  type VariantProps,
} from './trip-prototype-screen';

/**
 * PROTOTYPE VARIANT A — Itinerary timeline.
 *
 * The trip is a vertical route line: start point at the top, then each leg
 * (with its km) flowing into the next stop. Tapping a stop expands its full
 * arrival card inline, right where it sits in the route. Checklists are one
 * trip-level section at the bottom.
 */
export function VariantA({
  trip,
  stops,
  arrived,
  onToggleArrived,
  checklists,
  runs,
  onStartRun,
}: VariantProps): JSX.Element {
  const [expandedId, setExpandedId] = useState<string | undefined>(undefined);
  const status = tripStatus(stops, arrived);
  const nights = stops.reduce((sum, s) => sum + (s.nights ?? 0), 0);

  return (
    <>
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{trip.name}</h1>
          <StatusBadge status={status} />
        </div>
        <p className="text-sm text-muted-foreground">
          {String(stops.length)} stops · {formatKm(totalKm(stops))} ·{' '}
          {String(nights)} nights · {formatKm(loggedKm(stops, arrived))} logged
          to rig
        </p>
      </header>

      <ol className="relative flex flex-col border-l-2 border-border pl-6">
        <li className="pb-6">
          <span className="absolute -left-[7px] mt-1.5 size-3 rounded-full border-2 border-primary bg-background" />
          <p className="text-sm font-medium">{trip.startPoint}</p>
          <p className="text-xs text-muted-foreground">Start</p>
        </li>
        {stops.map((stop, i) => {
          const isArrived = arrived.has(stop.id);
          const isExpanded = expandedId === stop.id;
          return (
            <li key={stop.id} className="pb-6 last:pb-0">
              <p className="mb-3 text-xs text-muted-foreground">
                ↓ {formatKm(stop.legKm)}
              </p>
              <span
                className={`absolute -left-[7px] mt-1.5 size-3 rounded-full border-2 border-primary ${
                  isArrived ? 'bg-primary' : 'bg-background'
                }`}
              />
              <button
                type="button"
                className="flex w-full flex-col items-start text-left"
                onClick={() => {
                  setExpandedId(isExpanded ? undefined : stop.id);
                }}
              >
                <span className="flex items-center gap-2 font-medium">
                  {stop.campground ?? `Stop ${String(i + 1)}`}
                  {isArrived && (
                    <span className="text-xs font-medium text-emerald-600">
                      ✓ Arrived
                    </span>
                  )}
                  {i === stops.length - 1 && (
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">
                      Destination
                    </span>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatDate(stop.arrivalDate)}
                  {stop.nights !== undefined &&
                    ` · ${String(stop.nights)} night${stop.nights === 1 ? '' : 's'}`}
                </span>
              </button>
              {isExpanded && (
                <div className="mt-3 flex flex-col gap-3 rounded-lg border bg-card p-4">
                  <ArrivalDetails stop={stop} />
                  <Button
                    variant={isArrived ? 'outline' : 'default'}
                    onClick={() => {
                      onToggleArrived(stop.id);
                    }}
                  >
                    {isArrived
                      ? 'Undo arrival'
                      : `Mark arrived (+${formatKm(stop.legKm)} to rig)`}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Checklists on this trip</h2>
        {checklists.map((cl) => (
          <div
            key={cl.id}
            className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
          >
            <div>
              <p className="font-medium">{cl.name}</p>
              <p className="text-xs text-muted-foreground">
                {String(cl.items)} items
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                onStartRun(cl.id);
              }}
            >
              Run
            </Button>
          </div>
        ))}
        <h3 className="mt-2 text-sm font-medium text-muted-foreground">
          Runs on this trip
        </h3>
        <ul className="flex flex-col gap-1 text-sm">
          {runs.map((run) => (
            <li key={run.id} className="flex justify-between">
              <span>{run.checklistName}</span>
              <span className="text-muted-foreground">
                {run.startedAt} · {String(run.done)} of {String(run.total)} done
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function ArrivalDetails({ stop }: { readonly stop: ProtoStop }): JSX.Element {
  const rows: readonly (readonly [string, string | undefined])[] = [
    ['Site', stop.campsite],
    ['Check-in', stop.checkInTime],
    ['Check-out', stop.checkOutTime],
    ['Booking #', stop.bookingNumber],
    [
      'Cost',
      stop.costCents === undefined ? undefined : formatCost(stop.costCents),
    ],
    ['Address', stop.address],
    ['Phone', stop.phone],
    ['Notes', stop.notes],
  ];
  const present = rows.filter(([, value]) => value !== undefined);
  if (present.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No details yet — add the booking when it lands.
      </p>
    );
  }
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      {present.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

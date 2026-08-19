'use client';

import { BackLink, Button } from '@rv-checklist/web-ui';
import { useState, type JSX } from 'react';
import {
  formatCost,
  formatDate,
  formatKm,
  loggedKm,
  StatusBadge,
  totalKm,
  tripStatus,
  type VariantProps,
} from './trip-prototype-screen';

/**
 * PROTOTYPE VARIANT C — List + full-page drill-in.
 *
 * The pattern the maintenance screen already uses (issue #38): a single-column
 * list of stops; selecting one replaces the list with a full-page read-only
 * arrival detail and a back action. Checklists live on the trip list view;
 * the detail is purely the stop's one-stop-shop.
 */
export function VariantC({
  trip,
  stops,
  arrived,
  onToggleArrived,
  checklists,
  runs,
  onStartRun,
}: VariantProps): JSX.Element {
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const status = tripStatus(stops, arrived);
  const selected = stops.find((s) => s.id === selectedId);

  if (selected !== undefined) {
    const isArrived = arrived.has(selected.id);
    const rows: readonly (readonly [string, string | undefined])[] = [
      ['Arrival', formatDate(selected.arrivalDate)],
      [
        'Nights',
        selected.nights === undefined ? undefined : String(selected.nights),
      ],
      ['Site', selected.campsite],
      ['Check-in', selected.checkInTime],
      ['Check-out', selected.checkOutTime],
      ['Booking #', selected.bookingNumber],
      [
        'Cost',
        selected.costCents === undefined
          ? undefined
          : formatCost(selected.costCents),
      ],
      ['Leg distance', formatKm(selected.legKm)],
      ['Address', selected.address],
      ['Phone', selected.phone],
    ];
    return (
      <>
        <BackLink
          label={`← ${trip.name}`}
          onClick={() => {
            setSelectedId(undefined);
          }}
        />
        <header className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">
            {selected.campground ?? 'Unnamed stop'}
          </h1>
          {isArrived && (
            <span className="text-sm font-medium text-emerald-600">
              ✓ Arrived
            </span>
          )}
        </header>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 rounded-lg border bg-card p-4 text-sm">
          {rows
            .filter(([, value]) => value !== undefined)
            .map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
        </dl>
        {selected.notes !== undefined && (
          <p className="rounded-md bg-secondary p-3 text-sm">
            {selected.notes}
          </p>
        )}
        <Button
          variant={isArrived ? 'outline' : 'default'}
          onClick={() => {
            onToggleArrived(selected.id);
          }}
        >
          {isArrived
            ? 'Undo arrival'
            : `Mark arrived (+${formatKm(selected.legKm)} to rig)`}
        </Button>
      </>
    );
  }

  return (
    <>
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{trip.name}</h1>
          <StatusBadge status={status} />
        </div>
        <p className="text-sm text-muted-foreground">
          From {trip.startPoint} · {formatKm(totalKm(stops))} planned ·{' '}
          {formatKm(loggedKm(stops, arrived))} logged
        </p>
      </header>

      <ul className="flex flex-col gap-2">
        {stops.map((stop, i) => {
          const isArrived = arrived.has(stop.id);
          return (
            <li key={stop.id}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(stop.id);
                }}
                className="flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left hover:bg-accent"
              >
                <span
                  className={`size-2.5 shrink-0 rounded-full ${
                    isArrived ? 'bg-emerald-600' : 'bg-border'
                  }`}
                />
                <span className="flex-1">
                  <span className="block font-medium">
                    {stop.campground ?? `Stop ${String(i + 1)}`}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {formatDate(stop.arrivalDate)}
                    {stop.nights !== undefined &&
                      ` · ${String(stop.nights)} night${
                        stop.nights === 1 ? '' : 's'
                      }`}
                  </span>
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatKm(stop.legKm)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Checklists</h2>
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
              Start run
            </Button>
          </div>
        ))}
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

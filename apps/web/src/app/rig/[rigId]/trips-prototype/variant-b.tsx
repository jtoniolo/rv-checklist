'use client';

import { Button, ProgressBar } from '@rv-checklist/web-ui';
import { useState, type ClipboardEvent, type JSX } from 'react';
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
 * PROTOTYPE VARIANT B — Arrival-first dashboard.
 *
 * The next un-arrived stop's arrival card is the hero: everything needed at
 * the campground gate (site, check-in, booking number, address, phone, notes)
 * in one glance, with a big "Mark arrived" action and the trip's checklists
 * right on the card. The rest of the route is a compact list below.
 */
export function VariantB({
  trip,
  stops,
  arrived,
  onToggleArrived,
  checklists,
  runs,
  onStartRun,
  onResumeRun,
  onUndoStep,
  attachments,
  onAddAttachment,
}: VariantProps): JSX.Element {
  const status = tripStatus(stops, arrived);
  const nextStop = stops.find((s) => !arrived.has(s.id));
  const [mapOpen, setMapOpen] = useState(false);

  const nextAttachments =
    nextStop === undefined ? [] : (attachments[nextStop.id] ?? []);
  const campsiteMap = nextAttachments.find((a) => a.isMap === true);

  const handlePaste = (event: ClipboardEvent<HTMLButtonElement>): void => {
    if (nextStop === undefined) return;
    const item = [...event.clipboardData.items].find((i) =>
      i.type.startsWith('image/'),
    );
    const file = item?.getAsFile();
    if (file !== null && file !== undefined) {
      onAddAttachment(nextStop.id, {
        name: file.name === '' ? 'Pasted image' : file.name,
        kind: 'image',
        url: URL.createObjectURL(file),
      });
    }
  };

  return (
    <>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{trip.name}</h1>
          <p className="text-sm text-muted-foreground">
            From {trip.startPoint}
          </p>
        </div>
        <StatusBadge status={status} />
      </header>

      {nextStop === undefined ? (
        <section className="rounded-xl border bg-card p-5 text-center">
          <p className="text-lg font-semibold">Trip completed 🎉</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatKm(loggedKm(stops, arrived))} logged to the rig across{' '}
            {String(stops.length)} stops.
          </p>
        </section>
      ) : (
        <section className="flex flex-col gap-4 rounded-xl border-2 border-primary bg-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Next stop · {formatDate(nextStop.arrivalDate)}
              </p>
              <h2 className="text-xl font-semibold">
                {nextStop.campground ?? 'Unnamed stop'}
              </h2>
            </div>
            <span className="text-sm text-muted-foreground">
              {formatKm(nextStop.legKm)} drive
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <HeroFact label="Site" value={nextStop.campsite} />
            <HeroFact label="Check-in" value={nextStop.checkInTime} />
            <HeroFact
              label="Nights"
              value={
                nextStop.nights === undefined
                  ? undefined
                  : String(nextStop.nights)
              }
            />
            <HeroFact label="Booking #" value={nextStop.bookingNumber} />
            <HeroFact
              label="Cost"
              value={
                nextStop.costCents === undefined
                  ? undefined
                  : formatCost(nextStop.costCents)
              }
            />
            <HeroFact label="Check-out" value={nextStop.checkOutTime} />
          </div>

          {campsiteMap?.url !== undefined && (
            <>
              <button
                type="button"
                onClick={() => {
                  setMapOpen((open) => !open);
                }}
                className="flex items-center gap-2 self-start rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
              >
                🗺 Campsite map{' '}
                <span className="text-muted-foreground">
                  {mapOpen ? '· hide' : '· view'}
                </span>
              </button>
              {mapOpen && (
                // eslint-disable-next-line @next/next/no-img-element -- prototype; object/data URLs
                <img
                  src={campsiteMap.url}
                  alt={campsiteMap.name}
                  className="w-full rounded-lg border"
                />
              )}
            </>
          )}

          {nextStop.address !== undefined && (
            <p className="text-sm">
              <span className="text-muted-foreground">Address · </span>
              {nextStop.address}
            </p>
          )}
          {nextStop.phone !== undefined && (
            <p className="text-sm">
              <span className="text-muted-foreground">Phone · </span>
              <a className="underline" href={`tel:${nextStop.phone}`}>
                {nextStop.phone}
              </a>
            </p>
          )}
          {nextStop.notes !== undefined && (
            <p className="rounded-md bg-secondary p-3 text-sm">
              {nextStop.notes}
            </p>
          )}

          <Button
            size="lg"
            onClick={() => {
              onToggleArrived(nextStop.id);
            }}
          >
            Mark arrived — adds {formatKm(nextStop.legKm)} to the rig
          </Button>

          <div className="flex flex-wrap gap-2">
            {checklists.map((cl) => (
              <button
                key={cl.id}
                type="button"
                onClick={() => {
                  onStartRun(cl.id);
                }}
                className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium hover:bg-accent"
              >
                ▶ {cl.name}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 border-t pt-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Attachments
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {nextAttachments.map((att) =>
                att.kind === 'image' && att.url !== undefined ? (
                  // eslint-disable-next-line @next/next/no-img-element -- prototype; object/data URLs
                  <img
                    key={att.id}
                    src={att.url}
                    alt={att.name}
                    title={att.name}
                    className="h-16 w-24 rounded-md border object-cover"
                  />
                ) : (
                  <span
                    key={att.id}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
                  >
                    📄 {att.name}
                  </span>
                ),
              )}
            </div>
            <button
              type="button"
              onPaste={handlePaste}
              className="rounded-md border border-dashed px-3 py-2 text-center text-xs text-muted-foreground focus:ring-2 focus:ring-ring focus:outline-none"
            >
              Click here, then paste (Ctrl+V) a screenshot — e.g. the campground
              map from the Ontario Parks reservation page
            </button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Route · {formatKm(totalKm(stops))} total
        </h2>
        <ol className="divide-y rounded-lg border bg-card">
          {stops.map((stop, i) => {
            const isArrived = arrived.has(stop.id);
            return (
              <li
                key={stop.id}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm ${
                  isArrived ? 'opacity-60' : ''
                }`}
              >
                <span className="w-5 text-center font-semibold text-muted-foreground">
                  {isArrived ? '✓' : String(i + 1)}
                </span>
                <span className="flex-1">
                  {stop.campground ?? `Stop ${String(i + 1)}`}
                  {isArrived && (
                    <button
                      type="button"
                      className="ml-2 text-xs text-muted-foreground underline"
                      onClick={() => {
                        onToggleArrived(stop.id);
                      }}
                    >
                      undo
                    </button>
                  )}
                </span>
                <span className="text-muted-foreground">
                  {formatDate(stop.arrivalDate)}
                </span>
                <span className="w-16 text-right text-muted-foreground">
                  {formatKm(stop.legKm)}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Runs on this trip</h2>
        {runs.map((run) => {
          const isDone = run.done >= run.total;
          return (
            <div
              key={run.id}
              className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{run.checklistName}</p>
                  <p className="text-xs text-muted-foreground">
                    Started {run.startedAt} · {String(run.done)} of{' '}
                    {String(run.total)} done
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {run.done > 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        onUndoStep(run.id);
                      }}
                    >
                      Undo step
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      onResumeRun(run.id);
                    }}
                  >
                    {isDone ? 'Review' : 'Resume'}
                  </Button>
                </div>
              </div>
              <ProgressBar value={run.done / Math.max(1, run.total)} />
            </div>
          );
        })}
      </section>
    </>
  );
}

function HeroFact({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | undefined;
}): JSX.Element {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value ?? '—'}</p>
    </div>
  );
}

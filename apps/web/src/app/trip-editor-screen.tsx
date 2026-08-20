'use client';

import {
  UpdateStopSchema,
  UpdateTripSchema,
  type Id,
  type StopRead,
  type TripRead,
  type UpdateStop,
  type UpdateTrip,
} from '@rv-checklist/domain';
import {
  useCreateStopMutation,
  useDeleteStopMutation,
  useDeleteTripMutation,
  useListTripsByRigQuery,
  useReorderStopMutation,
  useRouteDistanceMutation,
  useUpdateStopMutation,
  useUpdateTripMutation,
} from '@rv-checklist/web-data-access';
import { Button, Input, Label, Textarea } from '@rv-checklist/web-ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type JSX } from 'react';
import { formatIsoDate } from './dates';
import { PlaceAutocomplete } from './place-autocomplete';
import { StopAttachments } from './stop-attachments';

const labelClass =
  'flex-col items-start gap-1 font-normal text-muted-foreground';

/**
 * The explicit `null` a PATCH body carries for a cleared field (house
 * clear-vs-omit) — the one place app code traffics in null.
 */
// eslint-disable-next-line unicorn/no-null
const CLEARED = null;

/**
 * The full trip editor (issue #115) at `/rig/{rigId}/trips/{tripId}/edit`:
 * trip fields (name, start point) plus the stop editor — add, edit, delete,
 * reorder, and the Maps-assisted flows (autocomplete, place-details pre-fill,
 * distance) per ADR-0025. Legs fill themselves (issue #121): whenever a stop
 * and its previous end both carry place IDs the leg is fetched automatically —
 * on add, on a place change at either end, and recalculated for affected stops
 * on reorder and delete. A manually typed leg is never overwritten
 * automatically (`legKmManual` provenance); the explicit fetch remains.
 * Linked checklists are managed on the trip screen (#116), not here.
 */
export function TripEditorScreen({
  rigId,
  tripId,
}: {
  readonly rigId: Id;
  readonly tripId: Id;
}): JSX.Element {
  const { data: trips, isLoading, isError } = useListTripsByRigQuery(rigId);
  const trip = trips?.find((t) => t.id === tripId);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/rig/${rigId}/trips/${tripId}`}
        className="self-start text-sm font-medium text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
      >
        &#8249; Back to trip
      </Link>

      {isLoading ? (
        <p className="text-brand-muted">Loading the trip&hellip;</p>
      ) : undefined}

      {isError ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          Couldn&apos;t load the trip. Please try again.
        </p>
      ) : undefined}

      {!isLoading && !isError && trip === undefined ? (
        <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
          This trip was not found — it may have been removed.
        </p>
      ) : undefined}

      {trip ? (
        <>
          <TripFieldsForm trip={trip} rigId={rigId} />
          <StopsSection trip={trip} rigId={rigId} />
          <DeleteTripSection trip={trip} rigId={rigId} />
        </>
      ) : undefined}
    </div>
  );
}

/**
 * The trip-level PATCH body, house clear-vs-omit: an untouched field is
 * omitted, a cleared start field becomes `null`. The parse keeps the body
 * honest against the shared schema.
 */
function tripChanges(
  trip: TripRead,
  name: string,
  startLocation: string,
  startPlaceId: string | undefined,
): UpdateTrip {
  const changes: Record<string, unknown> = {};
  if (name !== trip.name) changes['name'] = name;
  const start = startLocation === '' ? undefined : startLocation;
  if (start !== trip.startLocation) changes['startLocation'] = start ?? CLEARED;
  if (startPlaceId !== trip.startPlaceId) {
    changes['startPlaceId'] = startPlaceId ?? CLEARED;
  }
  return UpdateTripSchema.parse(changes);
}

function TripFieldsForm({
  trip,
  rigId,
}: {
  readonly trip: TripRead;
  readonly rigId: Id;
}): JSX.Element {
  const [updateTrip, { isLoading, isError }] = useUpdateTripMutation();
  const autoFillLeg = useAutoFillLeg(trip.id, rigId);
  const [name, setName] = useState(trip.name);
  const [startText, setStartText] = useState(trip.startLocation ?? '');
  const [startPlaceId, setStartPlaceId] = useState(trip.startPlaceId);
  const [startError, setStartError] = useState<string | undefined>(undefined);

  const submit = async (): Promise<void> => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    const trimmedStart = startText.trim();
    // An *edited* start point demands a Google pick (issue #120) — free text
    // alone can't feed the first leg. An untouched legacy text-only start
    // stays readable and never blocks a save of the other fields.
    if (
      startPlaceId === undefined &&
      trimmedStart !== '' &&
      trimmedStart !== trip.startLocation
    ) {
      setStartError(
        'Pick the start point from the suggestions — a start point without a Google place can’t feed the first leg.',
      );
      return;
    }
    setStartError(undefined);
    const changes = tripChanges(trip, trimmedName, trimmedStart, startPlaceId);
    if (Object.keys(changes).length === 0) return;
    await updateTrip({ id: trip.id, rigId, changes }).unwrap();
    // The start place is the first leg's origin — a change refills that leg
    // (issue #121); autoFillLeg skips manual, arrived, and un-placed stops.
    if ('startPlaceId' in changes) {
      const first = trip.stops.toSorted((a, b) => a.position - b.position)[0];
      if (first) {
        await autoFillLeg(
          first,
          typeof changes.startPlaceId === 'string'
            ? changes.startPlaceId
            : undefined,
        );
      }
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-3 rounded-xl border border-hairline p-4"
      aria-label="Trip"
    >
      <h2 className="text-lg font-semibold">Trip</h2>
      <Label className={labelClass}>
        Name
        <Input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          required
        />
      </Label>
      <PlaceAutocomplete
        label="Start point"
        text={startText}
        placeId={startPlaceId}
        placeholder="Home — Newmarket, ON"
        onChange={(text, placeId) => {
          setStartText(text);
          setStartPlaceId(placeId);
          if (placeId !== undefined) setStartError(undefined);
        }}
      />
      {startError === undefined ? undefined : (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {startError}
        </p>
      )}
      {isError ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          Couldn&apos;t save the trip. Please try again.
        </p>
      ) : undefined}
      <div className="flex gap-2">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving…' : 'Save trip'}
        </Button>
      </div>
    </form>
  );
}

/**
 * A stop's editable detail fields, parsed out of the form: `undefined` means
 * the field is blank. The same shape serves the create body (blank fields
 * simply drop out of the JSON) and, diffed against the original, the PATCH
 * body (blank-where-something-was becomes `null` — house clear-vs-omit).
 * Exported for the new-trip screen (issue #120), whose draft stops hold this
 * shape in local state until the single create request.
 */
export interface StopFieldValues {
  readonly campground: string | undefined;
  readonly placeId: string | undefined;
  readonly campsite: string | undefined;
  readonly arrivalDate: string | undefined;
  readonly nights: number | undefined;
  readonly checkInTime: string | undefined;
  readonly checkOutTime: string | undefined;
  readonly bookingNumber: string | undefined;
  readonly costCents: number | undefined;
  readonly address: string | undefined;
  readonly phone: string | undefined;
  readonly notes: string | undefined;
  readonly legKm: number | undefined;
  /** The leg's provenance: true = typed, false = fetched, undefined = no leg/unknown. */
  readonly legKmManual: boolean | undefined;
}

const STOP_FIELD_KEYS = [
  'campground',
  'placeId',
  'campsite',
  'arrivalDate',
  'nights',
  'checkInTime',
  'checkOutTime',
  'bookingNumber',
  'costCents',
  'address',
  'phone',
  'notes',
  'legKm',
  'legKmManual',
] as const;

/** The stop PATCH body: unchanged fields omitted, cleared ones `null`. */
function stopChanges(original: StopRead, next: StopFieldValues): UpdateStop {
  const changes: Record<string, unknown> = {};
  for (const key of STOP_FIELD_KEYS) {
    const before = original[key];
    const after = next[key];
    if (after === before) continue;
    changes[key] = after ?? CLEARED;
  }
  return UpdateStopSchema.parse(changes);
}

/**
 * Whether an automatic fetch may write this stop's leg (issue #121): never an
 * arrived stop (its leg is a log record with rig-Distance side effects), never
 * a manually typed leg, and never a pre-existing leg of unknown provenance
 * (pre-#121 data is treated as manual). The explicit fetch in the stop form
 * ignores this and always overwrites.
 */
function canAutoFill(stop: StopRead): boolean {
  if (stop.arrived || stop.legKmManual === true) return false;
  return stop.legKmManual === false || stop.legKm === undefined;
}

/** The place ID the leg into `index` starts from in an explicit stop ordering. */
function previousPlaceIn(
  ordered: readonly StopRead[],
  index: number,
  startPlaceId: string | undefined,
): string | undefined {
  return index === 0 ? startPlaceId : ordered[index - 1]?.placeId;
}

/**
 * Exactly what blocks a distance fetch (issue #121): name the missing end(s)
 * instead of leaving a silently dead control. `undefined` when nothing blocks.
 */
function missingPlaceMessage(
  hasStopPlace: boolean,
  hasPreviousPlace: boolean,
): string | undefined {
  if (hasStopPlace && hasPreviousPlace) return undefined;
  const stopEnd = 'this stop’s campground';
  const previousEnd =
    'the previous point (the stop before it, or the trip’s start point)';
  let missing: string;
  if (hasStopPlace) missing = previousEnd;
  else if (hasPreviousPlace) missing = stopEnd;
  else missing = `${stopEnd} and ${previousEnd}`;
  return `To fetch the distance, pick ${missing} from Google suggestions.`;
}

/**
 * The automatic leg-fill writer (issue #121): fetch the road distance into
 * `stop` from `fromPlaceId` and store it as a fetched (non-manual) leg.
 * Skips whatever {@link canAutoFill} protects and un-placed ends; failures
 * are silent — the explicit fetch in the stop form remains.
 */
function useAutoFillLeg(
  tripId: Id,
  rigId: Id,
): (stop: StopRead, fromPlaceId: string | undefined) => Promise<void> {
  const [routeDistance] = useRouteDistanceMutation();
  const [updateStop] = useUpdateStopMutation();
  return async (stop, fromPlaceId) => {
    if (!canAutoFill(stop)) return;
    if (fromPlaceId === undefined || stop.placeId === undefined) return;
    try {
      const { legKm } = await routeDistance({
        originPlaceId: fromPlaceId,
        destinationPlaceId: stop.placeId,
      }).unwrap();
      await updateStop({
        id: stop.id,
        tripId,
        rigId,
        changes: { legKm, legKmManual: false },
      }).unwrap();
    } catch {
      // Best-effort: manual entry and the explicit fetch stay available.
    }
  };
}

function StopsSection({
  trip,
  rigId,
}: {
  readonly trip: TripRead;
  readonly rigId: Id;
}): JSX.Element {
  const stops = trip.stops.toSorted((a, b) => a.position - b.position);
  // Which stop form is open — a stop id, one at a time; 'new' is the add form.
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const [saveFailed, setSaveFailed] = useState(false);
  const [lastStopBlocked, setLastStopBlocked] = useState(false);

  const [createStop, { isLoading: isCreating }] = useCreateStopMutation();
  const [updateStop, { isLoading: isUpdating }] = useUpdateStopMutation();
  const [deleteStop] = useDeleteStopMutation();
  const [reorderStop] = useReorderStopMutation();
  const autoFillLeg = useAutoFillLeg(trip.id, rigId);

  /** The place ID a leg into `index` starts from — previous stop, or the trip start. */
  const previousEndPlaceId = (index: number): string | undefined =>
    previousPlaceIn(stops, index, trip.startPlaceId);

  /**
   * Recalculate the leg of every stop whose previous end changed between two
   * orderings (issue #121) — after a reorder or a delete. Manual legs,
   * arrived stops, and un-placed ends are skipped by {@link useAutoFillLeg}.
   */
  const recalculateChangedLegs = async (
    before: readonly StopRead[],
    after: readonly StopRead[],
  ): Promise<void> => {
    await Promise.all(
      after.map((stop, index) => {
        const oldIndex = before.findIndex((s) => s.id === stop.id);
        const oldFrom = previousPlaceIn(before, oldIndex, trip.startPlaceId);
        const newFrom = previousPlaceIn(after, index, trip.startPlaceId);
        return oldFrom === newFrom
          ? Promise.resolve()
          : autoFillLeg(stop, newFrom);
      }),
    );
  };

  const moveStop = async (stop: StopRead, position: number): Promise<void> => {
    try {
      const after = await reorderStop({
        id: stop.id,
        tripId: trip.id,
        rigId,
        position,
      }).unwrap();
      await recalculateChangedLegs(stops, after);
    } catch {
      // The reorder failed; the list simply stays as it was.
    }
  };

  const removeStop = async (stop: StopRead): Promise<void> => {
    try {
      await deleteStop({ id: stop.id, tripId: trip.id, rigId }).unwrap();
      await recalculateChangedLegs(
        stops,
        stops.filter((s) => s.id !== stop.id),
      );
    } catch {
      // The delete failed; the list simply stays as it was.
    }
  };

  const submitStop = async (
    original: StopRead | undefined,
    values: StopFieldValues,
  ): Promise<void> => {
    setSaveFailed(false);
    try {
      if (original === undefined) {
        await createStop({ tripId: trip.id, ...values }).unwrap();
      } else {
        const changes = stopChanges(original, values);
        if (Object.keys(changes).length > 0) {
          await updateStop({
            id: original.id,
            tripId: trip.id,
            rigId,
            changes,
          }).unwrap();
          // This stop is the next stop's previous end — a place change here
          // moves that leg's origin, so it refills too (issue #121).
          if ('placeId' in changes) {
            const next =
              stops[stops.findIndex((s) => s.id === original.id) + 1];
            if (next) {
              await autoFillLeg(
                next,
                typeof changes.placeId === 'string'
                  ? changes.placeId
                  : undefined,
              );
            }
          }
        }
      }
      setEditing(undefined);
    } catch {
      setSaveFailed(true);
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-label="Stops">
      <h2 className="text-lg font-semibold">Stops</h2>

      {stops.length === 0 ? (
        <p className="text-brand-muted">No stops yet — add the first one.</p>
      ) : undefined}

      <ol className="flex flex-col gap-2">
        {stops.map((stop, index) => (
          <li
            key={stop.id}
            className="flex flex-col gap-3 rounded-xl border border-hairline p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">
                  {String(index + 1)}. {stop.campground ?? 'Unnamed stop'}
                  {stop.arrived ? (
                    <span className="ml-2 text-xs font-medium text-emerald-600">
                      Arrived
                    </span>
                  ) : undefined}
                </p>
                <p className="text-sm text-brand-muted">
                  {stop.arrivalDate === undefined
                    ? 'No date'
                    : formatIsoDate(stop.arrivalDate)}
                  {stop.nights === undefined
                    ? ''
                    : ` · ${String(stop.nights)} night${stop.nights === 1 ? '' : 's'}`}
                  {stop.legKm === undefined
                    ? ''
                    : ` · ${String(stop.legKm)} km leg`}
                </p>
              </div>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Move stop ${String(index + 1)} up`}
                  disabled={index === 0}
                  onClick={() => {
                    void moveStop(stop, index - 1);
                  }}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Move stop ${String(index + 1)} down`}
                  disabled={index === stops.length - 1}
                  onClick={() => {
                    void moveStop(stop, index + 1);
                  }}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSaveFailed(false);
                    setEditing(editing === stop.id ? undefined : stop.id);
                  }}
                >
                  {editing === stop.id ? 'Close' : 'Edit'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // A trip needs at least one stop (issue #120) — the last
                    // one never deletes from here; delete the trip instead.
                    if (stops.length === 1) {
                      setLastStopBlocked(true);
                      return;
                    }
                    setLastStopBlocked(false);
                    void removeStop(stop);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
            {/* Paperwork arrives while planning, not only at the next stop —
                every persisted stop card carries the manager. (A brand-new
                stop has no id yet, so it can't take attachments; save first.) */}
            <StopAttachments stop={stop} tripId={trip.id} rigId={rigId} />
            {editing === stop.id ? (
              <StopForm
                initial={stop}
                previousEndPlaceId={previousEndPlaceId(index)}
                pending={isUpdating}
                submitLabel="Save stop"
                onSubmit={(values) => void submitStop(stop, values)}
                onCancel={() => {
                  setEditing(undefined);
                }}
              />
            ) : undefined}
          </li>
        ))}
      </ol>

      {saveFailed ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          Couldn&apos;t save the stop. Please try again.
        </p>
      ) : undefined}

      {lastStopBlocked ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          This is the trip&apos;s last stop — a trip needs at least one. Delete
          the trip instead.
        </p>
      ) : undefined}

      {editing === 'new' ? (
        <StopForm
          previousEndPlaceId={
            stops.length === 0 ? trip.startPlaceId : stops.at(-1)?.placeId
          }
          pending={isCreating}
          submitLabel="Add stop"
          onSubmit={(values) => void submitStop(undefined, values)}
          onCancel={() => {
            setEditing(undefined);
          }}
        />
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="self-start"
          onClick={() => {
            setSaveFailed(false);
            setLastStopBlocked(false);
            setEditing('new');
          }}
        >
          Add stop
        </Button>
      )}
    </section>
  );
}

/** Cents to display dollars, e.g. 11240 to "112.40". Empty string when absent. */
function centsToDisplayDollars(cents: number | undefined): string {
  if (cents === undefined) return '';
  return (cents / 100).toFixed(2);
}

/** Blank to `undefined`, otherwise the trimmed text. */
function parseText(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * The stop add/edit form. Exported for the new-trip screen (issue #120),
 * which seeds it from local draft values instead of a persisted stop.
 */
export function StopForm({
  initial,
  previousEndPlaceId,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  /**
   * The stop being edited — a persisted stop or a new-trip draft's values;
   * `undefined` is the add form.
   */
  readonly initial?: Partial<StopFieldValues> & { readonly arrived?: boolean };
  /** The place ID the leg into this stop starts from, if the previous end has one. */
  readonly previousEndPlaceId: string | undefined;
  readonly pending: boolean;
  readonly submitLabel: string;
  readonly onSubmit: (values: StopFieldValues) => void;
  readonly onCancel: () => void;
}): JSX.Element {
  const [campground, setCampground] = useState(initial?.campground ?? '');
  const [placeId, setPlaceId] = useState(initial?.placeId);
  const [campsite, setCampsite] = useState(initial?.campsite ?? '');
  const [arrivalDate, setArrivalDate] = useState(initial?.arrivalDate ?? '');
  const [nightsText, setNightsText] = useState(
    initial?.nights === undefined ? '' : String(initial.nights),
  );
  const [checkInTime, setCheckInTime] = useState(initial?.checkInTime ?? '');
  const [checkOutTime, setCheckOutTime] = useState(initial?.checkOutTime ?? '');
  const [bookingNumber, setBookingNumber] = useState(
    initial?.bookingNumber ?? '',
  );
  const [costText, setCostText] = useState(
    centsToDisplayDollars(initial?.costCents),
  );
  const [address, setAddress] = useState(initial?.address ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [legKmText, setLegKmText] = useState(
    initial?.legKm === undefined ? '' : String(initial.legKm),
  );
  // The leg's provenance (issue #121): true = the owner typed the current
  // value, false = a maps fetch filled it, undefined = unknown (pre-#121
  // data, or no leg yet). Typing sets it true; any fetch sets it false.
  const [legKmManual, setLegKmManual] = useState<boolean | undefined>(
    initial?.legKmManual,
  );
  const [error, setError] = useState<string | undefined>(undefined);

  const [routeDistance, { isLoading: isFetchingDistance }] =
    useRouteDistanceMutation();
  const canFetchDistance =
    placeId !== undefined && previousEndPlaceId !== undefined;
  const missingPlace = missingPlaceMessage(
    placeId !== undefined,
    previousEndPlaceId !== undefined,
  );
  // A pre-existing leg of unknown provenance is treated as manual.
  const isLegManual = legKmManual ?? initial?.legKm !== undefined;

  /** The explicit fetch: always overwrites the leg and clears the manual flag. */
  const fetchDistance = async (): Promise<void> => {
    if (placeId === undefined || previousEndPlaceId === undefined) return;
    try {
      const { legKm } = await routeDistance({
        originPlaceId: previousEndPlaceId,
        destinationPlaceId: placeId,
      }).unwrap();
      setLegKmText(String(legKm));
      setLegKmManual(false);
      setError(undefined);
    } catch {
      setError('Couldn’t fetch the distance — enter it by hand or try again.');
    }
  };

  /**
   * The automatic fill on a place pick (issue #121): fetch only when both
   * ends carry a place and nothing protects the current leg — never a manual
   * (or unknown-provenance) leg, never an arrived stop's (its leg is a log
   * record with rig-Distance side effects). Failures are silent — the
   * explicit fetch and manual entry remain.
   */
  const autoFillDistance = async (destination: string): Promise<void> => {
    if (previousEndPlaceId === undefined) return;
    if (isLegManual || initial?.arrived === true) return;
    try {
      const { legKm } = await routeDistance({
        originPlaceId: previousEndPlaceId,
        destinationPlaceId: destination,
      }).unwrap();
      setLegKmText(String(legKm));
      setLegKmManual(false);
    } catch {
      // Best-effort.
    }
  };

  const submit = (): void => {
    // Nights: blank means none, otherwise at least one whole night.
    const trimmedNights = nightsText.trim();
    const nights = trimmedNights === '' ? undefined : Number(trimmedNights);
    if (nights !== undefined && (!Number.isSafeInteger(nights) || nights < 1)) {
      setError('Nights must be a whole number of at least 1.');
      return;
    }
    // Cost: decimal dollars to integer cents (house pattern, see log-entry-form).
    const trimmedCost = costText.trim();
    let costCents: number | undefined;
    if (trimmedCost !== '') {
      const dollars = Number(trimmedCost);
      if (Number.isNaN(dollars) || dollars < 0) {
        setError('Cost must be a positive dollar amount.');
        return;
      }
      costCents = Math.round(dollars * 100);
    }
    // Leg: blank means none, otherwise whole non-negative km.
    const trimmedLeg = legKmText.trim();
    const legKm = trimmedLeg === '' ? undefined : Number(trimmedLeg);
    if (legKm !== undefined && (!Number.isSafeInteger(legKm) || legKm < 0)) {
      setError('The leg must be a whole number of kilometres.');
      return;
    }
    setError(undefined);
    onSubmit({
      campground: parseText(campground),
      placeId,
      campsite: parseText(campsite),
      arrivalDate: parseText(arrivalDate),
      nights,
      checkInTime: parseText(checkInTime),
      checkOutTime: parseText(checkOutTime),
      bookingNumber: parseText(bookingNumber),
      costCents,
      address: parseText(address),
      phone: parseText(phone),
      notes: parseText(notes),
      legKm,
      // No leg means no provenance; otherwise the tracked flag (an untouched
      // pre-#121 leg stays undefined, so nothing is written for it).
      legKmManual: legKm === undefined ? undefined : legKmManual,
    });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="flex flex-col gap-3 rounded-xl border border-hairline p-4"
      aria-label={initial === undefined ? 'New stop' : 'Edit stop'}
    >
      <PlaceAutocomplete
        label="Campground"
        text={campground}
        placeId={placeId}
        placeholder="Killbear Provincial Park"
        onChange={(text, picked) => {
          setCampground(text);
          if (picked !== undefined && picked !== placeId) {
            void autoFillDistance(picked);
          }
          setPlaceId(picked);
        }}
        onDetails={(details) => {
          // Pre-fill lands as the owner's editable data (ADR-0025); fields
          // Google omits keep whatever the owner already typed.
          if (details.address !== undefined) setAddress(details.address);
          if (details.phone !== undefined) setPhone(details.phone);
        }}
      />
      <Label className={labelClass}>
        Campsite
        <Input
          value={campsite}
          onChange={(e) => {
            setCampsite(e.target.value);
          }}
          placeholder="Site 402"
        />
      </Label>
      <div className="flex flex-wrap gap-3">
        <Label className={labelClass}>
          Arrival date
          <Input
            type="date"
            className="w-44"
            value={arrivalDate}
            onChange={(e) => {
              setArrivalDate(e.target.value);
            }}
          />
        </Label>
        <Label className={labelClass}>
          Nights
          <Input
            type="number"
            min={1}
            step={1}
            className="w-24"
            value={nightsText}
            onChange={(e) => {
              setNightsText(e.target.value);
            }}
          />
        </Label>
      </div>
      <div className="flex flex-wrap gap-3">
        <Label className={labelClass}>
          Check-in
          <Input
            className="w-44"
            value={checkInTime}
            onChange={(e) => {
              setCheckInTime(e.target.value);
            }}
            placeholder="after 2pm"
          />
        </Label>
        <Label className={labelClass}>
          Check-out
          <Input
            className="w-44"
            value={checkOutTime}
            onChange={(e) => {
              setCheckOutTime(e.target.value);
            }}
            placeholder="11:00"
          />
        </Label>
      </div>
      <div className="flex flex-wrap gap-3">
        <Label className={labelClass}>
          Booking number
          <Input
            className="w-44"
            value={bookingNumber}
            onChange={(e) => {
              setBookingNumber(e.target.value);
            }}
          />
        </Label>
        <Label className={labelClass}>
          Cost ($)
          <Input
            type="number"
            min={0}
            step={0.01}
            className="w-32"
            value={costText}
            onChange={(e) => {
              setCostText(e.target.value);
            }}
            placeholder="112.40"
          />
        </Label>
      </div>
      <Label className={labelClass}>
        Address
        <Input
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
          }}
        />
      </Label>
      <Label className={labelClass}>
        Phone
        <Input
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
          }}
        />
      </Label>
      <Label className={labelClass}>
        Notes
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
          }}
        />
      </Label>
      <Label className={labelClass}>
        Leg (km)
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            step={1}
            className="w-32"
            value={legKmText}
            onChange={(e) => {
              setLegKmText(e.target.value);
              setLegKmManual(true);
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canFetchDistance || isFetchingDistance}
            onClick={() => {
              void fetchDistance();
            }}
          >
            {isFetchingDistance ? 'Fetching…' : 'Fetch distance'}
          </Button>
        </div>
        {missingPlace === undefined ? undefined : (
          <span className="text-xs">{missingPlace}</span>
        )}
        {initial?.arrived === true ? (
          <span className="text-xs">
            This stop is arrived — changing the leg adjusts the rig&apos;s
            Distance by the difference.
          </span>
        ) : undefined}
      </Label>

      {error === undefined ? undefined : (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DeleteTripSection({
  trip,
  rigId,
}: {
  readonly trip: TripRead;
  readonly rigId: Id;
}): JSX.Element {
  const router = useRouter();
  const [deleteTrip, { isLoading, isError }] = useDeleteTripMutation();
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async (): Promise<void> => {
    await deleteTrip({ id: trip.id, rigId }).unwrap();
    router.push(`/rig/${rigId}/trips`);
  };

  return (
    <section
      className="flex flex-col gap-2 rounded-xl border border-hairline p-4"
      aria-label="Delete trip"
    >
      {confirming ? (
        <>
          <p className="text-sm">
            Delete “{trip.name}” and all its stops? This can&apos;t be undone.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={isLoading}
              onClick={() => {
                void handleDelete();
              }}
            >
              {isLoading ? 'Deleting…' : 'Yes, delete it'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setConfirming(false);
              }}
            >
              Keep the trip
            </Button>
          </div>
        </>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="self-start text-red-600 dark:text-red-400"
          onClick={() => {
            setConfirming(true);
          }}
        >
          Delete trip
        </Button>
      )}
      {isError ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          Couldn&apos;t delete the trip. Please try again.
        </p>
      ) : undefined}
    </section>
  );
}

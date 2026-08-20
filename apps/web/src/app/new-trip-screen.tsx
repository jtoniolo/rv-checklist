'use client';

import type { Id } from '@rv-checklist/domain';
import {
  useCreateTripMutation,
  useRouteDistanceMutation,
} from '@rv-checklist/web-data-access';
import { Button, Input, Label } from '@rv-checklist/web-ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type JSX } from 'react';
import { formatIsoDate } from './dates';
import { canAutoFillLeg, changedLegOrigins } from './leg-recalc';
import { PlaceAutocomplete } from './place-autocomplete';
import { StopForm, type StopFieldValues } from './trip-editor-screen';

const labelClass =
  'flex-col items-start gap-1 font-normal text-muted-foreground';

/**
 * A stop drafted before its trip exists — local state only, keyed for React
 * lists, until the single create request carries the whole plan (issue #120).
 */
interface DraftStop {
  readonly key: number;
  readonly values: StopFieldValues;
}

/**
 * The full create form (issue #120), replacing the minimal two-field form of
 * issue #114: the same trip fields and stop editor as the trip editor. The
 * start point requires a Google-picked place and the trip at least one stop —
 * enforced here with inline messages, not on the wire (the MCP create tool
 * shares the schema). One save creates trip and stops together and navigates
 * to the trip screen. Attachments are absent: they need a persisted stop id,
 * so paperwork lands in the editor after the save.
 */
export function NewTripScreen({ rigId }: { readonly rigId: Id }): JSX.Element {
  const router = useRouter();
  const [createTrip, { isLoading, isError }] = useCreateTripMutation();
  const [name, setName] = useState('');
  const [startText, setStartText] = useState('');
  const [startPlaceId, setStartPlaceId] = useState<string | undefined>(
    undefined,
  );
  const [drafts, setDrafts] = useState<readonly DraftStop[]>([]);
  const [nextKey, setNextKey] = useState(0);
  // Which draft's form is open — a draft key, one at a time; 'new' is the add form.
  const [editing, setEditing] = useState<number | 'new' | undefined>(undefined);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [startError, setStartError] = useState<string | undefined>(undefined);
  const [stopsError, setStopsError] = useState<string | undefined>(undefined);

  const [routeDistance] = useRouteDistanceMutation();

  /** The place ID a leg into the draft at `index` starts from — previous draft, or the trip start. */
  const previousEndPlaceId = (index: number): string | undefined =>
    index === 0 ? startPlaceId : drafts[index - 1]?.values.placeId;

  /** A draft wrapped for the origin diff — its place lifted beside its key. */
  const placed = (
    list: readonly DraftStop[],
  ): readonly { key: number; placeId: string | undefined }[] =>
    list.map((d) => ({ key: d.key, placeId: d.values.placeId }));

  /**
   * Refetch the leg of every draft whose origin place changed between the two
   * orderings (issue #123) — the drafts' counterpart of the editor's
   * recalculation (issue #121), sharing the same pure rules. Manual legs,
   * unknown-provenance legs, and un-placed ends are skipped; failures are
   * silent — the in-form fetch and manual entry remain. Each result is
   * written functionally by draft key: the fetch is async, so the drafts
   * array captured here may be stale by the time it lands (a draft deleted
   * mid-fetch simply matches nothing).
   */
  const recalculateDraftLegs = async (
    before: readonly DraftStop[],
    after: readonly DraftStop[],
    beforeStart: string | undefined,
    afterStart: string | undefined,
  ): Promise<void> => {
    const values = new Map(after.map((d) => [d.key, d.values]));
    const changed = changedLegOrigins(
      placed(before),
      beforeStart,
      placed(after),
      afterStart,
      (d) => d.key,
    );
    await Promise.all(
      changed.map(async ({ item, from }) => {
        const draftValues = values.get(item.key);
        if (draftValues === undefined || !canAutoFillLeg(draftValues)) return;
        if (from === undefined || item.placeId === undefined) return;
        try {
          const { legKm } = await routeDistance({
            originPlaceId: from,
            destinationPlaceId: item.placeId,
          }).unwrap();
          setDrafts((current) =>
            current.map((d) =>
              d.key === item.key
                ? {
                    key: d.key,
                    values: { ...d.values, legKm, legKmManual: false },
                  }
                : d,
            ),
          );
        } catch {
          // Best-effort: the draft keeps its old leg; the form's explicit
          // fetch and manual entry stay available.
        }
      }),
    );
  };

  const addDraft = (values: StopFieldValues): void => {
    // No recalculation: the appended draft fills its own leg in the form and
    // changes no other draft's origin.
    setDrafts([...drafts, { key: nextKey, values }]);
    setNextKey(nextKey + 1);
    setEditing(undefined);
    setStopsError(undefined);
  };

  const saveDraft = (key: number, values: StopFieldValues): void => {
    const next = drafts.map((d) => (d.key === key ? { key, values } : d));
    setDrafts(next);
    setEditing(undefined);
    // This draft is the next draft's previous end — the diff finds that leg
    // exactly when the saved draft's place changed (issue #123).
    void recalculateDraftLegs(drafts, next, startPlaceId, startPlaceId);
  };

  const deleteDraft = (key: number): void => {
    const next = drafts.filter((d) => d.key !== key);
    setDrafts(next);
    if (editing === key) setEditing(undefined);
    void recalculateDraftLegs(drafts, next, startPlaceId, startPlaceId);
  };

  const moveDraft = (index: number, delta: -1 | 1): void => {
    const next = [...drafts];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) return;
    next.splice(index + delta, 0, moved);
    setDrafts(next);
    void recalculateDraftLegs(drafts, next, startPlaceId, startPlaceId);
  };

  const submit = async (): Promise<void> => {
    const trimmedName = name.trim();
    const isNameMissing = trimmedName === '';
    // The start point must be a Google-picked place (issue #120): free text
    // alone can't feed the first leg, so it is not accepted here.
    const isStartPlaceMissing =
      startPlaceId === undefined || startText.trim() === '';
    const hasNoStops = drafts.length === 0;
    setNameError(isNameMissing ? 'Name the trip.' : undefined);
    setStartError(
      isStartPlaceMissing
        ? 'Pick the start point from the suggestions — a start point without a Google place can’t feed the first leg.'
        : undefined,
    );
    setStopsError(
      hasNoStops
        ? 'Add at least one stop — a trip without stops is not a trip.'
        : undefined,
    );
    if (isNameMissing || isStartPlaceMissing || hasNoStops) return;
    try {
      // One request creates the whole plan — the server writes trip and stops
      // in a single transaction, never trip-then-stops from here (issue #120).
      const created = await createTrip({
        rigId,
        name: trimmedName,
        startLocation: startText.trim(),
        startPlaceId,
        checklistIds: [],
        stops: drafts.map((d) => d.values),
      }).unwrap();
      router.push(`/rig/${rigId}/trips/${created.id}`);
    } catch {
      // The mutation's isError renders the retry message below.
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/rig/${rigId}/trips`}
        className="self-start text-sm font-medium text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
      >
        &#8249; All trips
      </Link>

      <section
        className="flex flex-col gap-3 rounded-xl border border-hairline p-4"
        aria-label="New trip"
      >
        <h2 className="text-lg font-semibold">Trip</h2>
        <Label className={labelClass}>
          Name
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
            }}
            placeholder="Fall Colours Loop"
            required
          />
        </Label>
        <PlaceAutocomplete
          label="Start point"
          text={startText}
          placeId={startPlaceId}
          placeholder="Home — Newmarket, ON"
          onChange={(text, placeId) => {
            const previous = startPlaceId;
            setStartText(text);
            setStartPlaceId(placeId);
            if (placeId !== undefined) {
              setStartError(undefined);
              // A newly picked start place is the first leg's origin — refill
              // that leg (issue #123), covering a first draft added before
              // the start was picked. Typing (no place) recalculates nothing.
              if (placeId !== previous) {
                void recalculateDraftLegs(drafts, drafts, previous, placeId);
              }
            }
          }}
        />
        {nameError === undefined ? undefined : (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {nameError}
          </p>
        )}
        {startError === undefined ? undefined : (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {startError}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-label="Stops">
        <h2 className="text-lg font-semibold">Stops</h2>

        {drafts.length === 0 ? (
          <p className="text-brand-muted">
            No stops yet — a trip needs at least one.
          </p>
        ) : undefined}

        <ol className="flex flex-col gap-2">
          {drafts.map((draft, index) => (
            <li
              key={draft.key}
              className="flex flex-col gap-3 rounded-xl border border-hairline p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {String(index + 1)}.{' '}
                    {draft.values.campground ?? 'Unnamed stop'}
                  </p>
                  <p className="text-sm text-brand-muted">
                    {draft.values.arrivalDate === undefined
                      ? 'No date'
                      : formatIsoDate(draft.values.arrivalDate)}
                    {draft.values.nights === undefined
                      ? ''
                      : ` · ${String(draft.values.nights)} night${draft.values.nights === 1 ? '' : 's'}`}
                    {draft.values.legKm === undefined
                      ? ''
                      : ` · ${String(draft.values.legKm)} km leg`}
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
                      moveDraft(index, -1);
                    }}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Move stop ${String(index + 1)} down`}
                    disabled={index === drafts.length - 1}
                    onClick={() => {
                      moveDraft(index, 1);
                    }}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(editing === draft.key ? undefined : draft.key);
                    }}
                  >
                    {editing === draft.key ? 'Close' : 'Edit'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      deleteDraft(draft.key);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              {editing === draft.key ? (
                <StopForm
                  initial={draft.values}
                  previousEndPlaceId={previousEndPlaceId(index)}
                  pending={false}
                  submitLabel="Save stop"
                  onSubmit={(values) => {
                    saveDraft(draft.key, values);
                  }}
                  onCancel={() => {
                    setEditing(undefined);
                  }}
                />
              ) : undefined}
            </li>
          ))}
        </ol>

        {editing === 'new' ? (
          <StopForm
            previousEndPlaceId={
              drafts.length === 0 ? startPlaceId : drafts.at(-1)?.values.placeId
            }
            pending={false}
            submitLabel="Add stop"
            onSubmit={addDraft}
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
              setEditing('new');
            }}
          >
            Add stop
          </Button>
        )}

        {stopsError === undefined ? undefined : (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {stopsError}
          </p>
        )}
      </section>

      <div className="flex flex-col gap-2">
        {isError ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            Couldn&apos;t create the trip. Please try again.
          </p>
        ) : undefined}
        <Button
          type="button"
          className="self-start"
          disabled={isLoading}
          onClick={() => {
            void submit();
          }}
        >
          {isLoading ? 'Creating…' : 'Create trip'}
        </Button>
      </div>
    </div>
  );
}

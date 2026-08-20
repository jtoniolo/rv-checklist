/**
 * The pure rules of automatic leg recalculation (issue #121), shared by the
 * trip editor (persisted stops) and the new-trip screen (local drafts). The
 * writers stay per-screen — the editor PATCHes stops, the new-trip screen
 * rewrites draft state — but what may be filled and which legs a change
 * touches is decided here, once.
 */

/** The provenance fields the tri-state rule reads — a stop or a draft's values. */
export interface LegProvenance {
  /** Drafts never carry this — a stop can only arrive once it is persisted. */
  readonly arrived?: boolean | undefined;
  readonly legKm?: number | undefined;
  /** true = typed, false = fetched, undefined = no leg or unknown provenance. */
  readonly legKmManual?: boolean | undefined;
}

/**
 * Whether an automatic fetch may write this leg (issue #121): never an
 * arrived stop's (its leg is a log record with rig-Distance side effects),
 * never a manually typed leg, and never a pre-existing leg of unknown
 * provenance (pre-#121 data is treated as manual). An explicit in-form fetch
 * ignores this and always overwrites.
 */
export function canAutoFillLeg({
  arrived,
  legKm,
  legKmManual,
}: LegProvenance): boolean {
  if (arrived === true || legKmManual === true) return false;
  return legKmManual === false || legKm === undefined;
}

/** Anything a leg can start from or arrive at — a stop, or a draft wrapped for the diff. */
export interface Placed {
  readonly placeId?: string | undefined;
}

/** The place ID the leg into `index` starts from in an explicit ordering. */
export function previousPlaceIn(
  ordered: readonly Placed[],
  index: number,
  startPlaceId: string | undefined,
): string | undefined {
  return index === 0 ? startPlaceId : ordered[index - 1]?.placeId;
}

/** An item whose leg origin changed, with the place the leg now starts from. */
export interface ChangedLegOrigin<T extends Placed> {
  readonly item: T;
  readonly from: string | undefined;
}

/**
 * Every item in `after` whose leg origin differs between the two orderings —
 * after a reorder, a delete, a place change on the item before it, or a
 * start-place change (pass the same array with the two start IDs). Items are
 * matched by `keyOf`, never by reference: the editor's `after` comes from the
 * reorder response as fresh objects, and drafts are re-created on every edit.
 */
export function changedLegOrigins<T extends Placed>(
  before: readonly T[],
  beforeStart: string | undefined,
  after: readonly T[],
  afterStart: string | undefined,
  keyOf: (item: T) => string | number,
): readonly ChangedLegOrigin<T>[] {
  return after.flatMap((item, index) => {
    const key = keyOf(item);
    const oldIndex = before.findIndex((candidate) => keyOf(candidate) === key);
    const oldFrom = previousPlaceIn(before, oldIndex, beforeStart);
    const newFrom = previousPlaceIn(after, index, afterStart);
    return oldFrom === newFrom ? [] : [{ item, from: newFrom }];
  });
}

import type { IsoDate } from './common.js';
import type { Interval } from './maintenance-task.js';

/**
 * A task's due/overdue standing, computed on read from its last completion and
 * interval (ADR-0005) — never stored, never scheduled, never notified. A task
 * with no interval and no one-time marker is simply not tracked; a one-time task
 * is due from creation until it's done (issue #29), so it always reads as
 * `one-time` (needing attention) — completing it deletes it, so a live one-time
 * task never has a completion to age. A recurring task with an interval but no
 * log entry yet has no basis for a due date, so it reads as never-performed.
 *
 * A **distance** task (issue #32) is measured against the rig's Distance rather
 * than the calendar: it reads `reading-needed` when the rig has no current
 * Distance, or its newest completion carries no Distance reading — there is no
 * yardstick to measure against, so the owner is nudged to set one. A tracked
 * `ok`/`due`/`overdue` is tagged with its `basis` (mirroring the Interval union,
 * ADR-0015) and carries the numbers behind the standing: a calendar task its
 * last-performed and due dates, a distance task the kilometres it is due at and
 * where the rig is now.
 */
export type DueStatus =
  | { readonly kind: 'untracked' }
  | { readonly kind: 'one-time' }
  | { readonly kind: 'never-performed' }
  | { readonly kind: 'reading-needed' }
  | {
      readonly kind: 'ok' | 'due' | 'overdue';
      readonly basis: 'calendar';
      readonly lastPerformedOn: IsoDate;
      readonly dueOn: IsoDate;
    }
  | {
      readonly kind: 'ok' | 'due' | 'overdue';
      readonly basis: 'distance';
      readonly dueAtKm: number;
      readonly currentKm: number;
    };

/**
 * The inputs a due-status read needs, gathered into one context object (ADR-0015)
 * so each basis can add inputs without reshaping every call site. Every field the
 * caller supplies, keeping the computation pure:
 *
 * - `interval` — the task's Interval (a tagged union on `basis`), or `undefined`
 *   when untracked;
 * - `lastPerformedOn` — the newest log entry's date (see {@link latestPerformedOn}),
 *   the anchor a calendar interval's next due is measured from;
 * - `today` — supplied by the caller;
 * - `isOneTime` — the task's one-time marker (issue #29): a one-time task needs
 *   attention from creation, so it short-circuits ahead of the interval arithmetic;
 * - `rigDistanceKm` — the rig's current Distance in km (issue #32), or `undefined`
 *   when the owner hasn't set one; the yardstick a distance interval measures against;
 * - `lastReadingKm` — the newest completion's Distance reading in km (see
 *   {@link latestReadingKm}), or `undefined` when that completion carries none;
 *   the anchor a distance interval's next due is measured from.
 */
export interface DueStatusInput {
  readonly interval: Interval | undefined;
  readonly lastPerformedOn: IsoDate | undefined;
  readonly today: IsoDate;
  readonly isOneTime?: boolean;
  readonly rigDistanceKm?: number | undefined;
  readonly lastReadingKm?: number | undefined;
}

/** The due/overdue status for one task, from its {@link DueStatusInput} context. */
export function dueStatus({
  interval,
  lastPerformedOn,
  today,
  isOneTime = false,
  rigDistanceKm,
  lastReadingKm,
}: DueStatusInput): DueStatus {
  if (isOneTime) {
    return { kind: 'one-time' };
  }
  if (interval === undefined) {
    return { kind: 'untracked' };
  }
  // A distance interval is anchored solely off a logged Distance reading and
  // measured against the rig's current Distance (ADR-0015), never the calendar.
  if (interval.basis === 'distance') {
    // No completion at all — no reading to anchor from, so nothing to measure.
    if (lastPerformedOn === undefined) {
      return { kind: 'never-performed' };
    }
    // A yardstick is missing: the rig has no current Distance, or the newest
    // completion recorded none. Nudge the owner to set one (issue #32).
    if (rigDistanceKm === undefined || lastReadingKm === undefined) {
      return { kind: 'reading-needed' };
    }
    const dueAtKm = lastReadingKm + interval.km;
    // Due once the rig reaches the reading it was last done at plus the interval.
    const kind =
      rigDistanceKm < dueAtKm
        ? 'ok'
        : rigDistanceKm === dueAtKm
          ? 'due'
          : 'overdue';
    return { kind, basis: 'distance', dueAtKm, currentKm: rigDistanceKm };
  }
  // A calendar interval anchors off the last completion's date (ADR-0015).
  if (lastPerformedOn === undefined) {
    return { kind: 'never-performed' };
  }
  const dueOn = addMonths(lastPerformedOn, interval.months);
  // IsoDates compare correctly as strings ('YYYY-MM-DD' is lexicographic).
  const kind = today < dueOn ? 'ok' : today === dueOn ? 'due' : 'overdue';
  return { kind, basis: 'calendar', lastPerformedOn, dueOn };
}

/**
 * `date` plus `months` calendar months, as pure IsoDate arithmetic. The day is
 * clamped to the target month's length (Jan 31 + 1 month = Feb 28/29) rather
 * than rolled into the next month.
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const [year = 0, month = 0, day = 0] = date.split('-').map(Number);
  // Day 0 of the month after the target is the target month's last day.
  const lastDay = new Date(Date.UTC(year, month + months, 0));
  lastDay.setUTCDate(Math.min(day, lastDay.getUTCDate()));
  return lastDay.toISOString().slice(0, 10);
}

/** The newest entry date — the "last completion" that due-status reads from. */
export function latestPerformedOn(
  entries: readonly { readonly performedOn: IsoDate }[],
): IsoDate | undefined {
  let latest: IsoDate | undefined;
  for (const { performedOn } of entries) {
    if (latest === undefined || performedOn > latest) {
      latest = performedOn;
    }
  }
  return latest;
}

/**
 * The Distance reading (km) of the newest completion — the anchor a distance
 * interval's next due is measured from (issue #32). Picks the same newest entry
 * as {@link latestPerformedOn} (newest `performedOn` wins) and returns *its*
 * reading, so an older completion's reading never anchors a newer one. Undefined
 * when there are no entries, or the newest one carries no reading.
 */
export function latestReadingKm(
  entries: readonly {
    readonly performedOn: IsoDate;
    readonly distanceKm?: number | undefined;
  }[],
): number | undefined {
  let latest:
    | {
        readonly performedOn: IsoDate;
        readonly distanceKm?: number | undefined;
      }
    | undefined;
  for (const entry of entries) {
    if (latest === undefined || entry.performedOn > latest.performedOn) {
      latest = entry;
    }
  }
  return latest?.distanceKm;
}

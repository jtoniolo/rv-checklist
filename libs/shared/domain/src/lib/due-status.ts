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
 * A **distance** limit (issue #32) is measured against the rig's Distance rather
 * than the calendar: it reads `reading-needed` when the rig has no current
 * Distance, or its newest completion carries no Distance reading — there is no
 * yardstick to measure against, so the owner is nudged to set one. `reading-needed`
 * surfaces only when distance is the task's **sole** limit; a combined task whose
 * distance limit can't be evaluated falls back to its calendar standing (ADR-0016).
 * A tracked `ok`/`due`/`overdue` is tagged with its `basis` — the limit that is
 * driving the standing (the more urgent when both are present) — and carries the
 * numbers behind it: a calendar standing its last-performed and due dates, a
 * distance standing the kilometres it is due at and where the rig is now.
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
 * - `interval` — the task's Interval (up to two limits, `months` and/or `km`,
 *   ADR-0016), or `undefined` when untracked;
 * - `lastPerformedOn` — the newest log entry's date (see {@link latestPerformedOn}),
 *   one of the two anchors a calendar interval's next due is measured from;
 * - `lastPerformed` — the task's optional **manual** last-performed anchor (issue
 *   #33), an owner's hand-set date needing no completion. A calendar interval
 *   anchors off the *later* of this and `lastPerformedOn` — a real completion
 *   always supersedes the manual guess. Applies to the calendar limit only; a
 *   distance-only interval ignores it (ADR-0015);
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
  readonly lastPerformed?: IsoDate | undefined;
  readonly rigDistanceKm?: number | undefined;
  readonly lastReadingKm?: number | undefined;
}

/** A tracked standing carrying its numbers — the concrete side of a {@link DueStatus}. */
type Standing = Extract<DueStatus, { kind: 'ok' | 'due' | 'overdue' }>;
/**
 * One limit's outcome: a concrete {@link Standing}, or a reason it couldn't be
 * evaluated — `never-performed` (no anchor / no completion) or `reading-needed`
 * (a distance limit with no yardstick).
 */
type LimitOutcome =
  Standing | { readonly kind: 'never-performed' | 'reading-needed' };

/** How urgent a concrete standing is — higher wins "whichever elapses first". */
const URGENCY = { ok: 0, due: 1, overdue: 2 } as const;
const STANDING_KINDS = ['ok', 'due', 'overdue'] as const;

function isStanding(outcome: LimitOutcome): outcome is Standing {
  return (STANDING_KINDS as readonly string[]).includes(outcome.kind);
}

/**
 * The calendar limit's outcome (issue #33): it anchors off the *later* of the
 * newest completion's date and the owner's manual anchor — a real completion
 * always supersedes the manual guess. Either or both may be absent, in which
 * case there is no basis for a due date (`never-performed`).
 */
function calendarOutcome(
  months: number,
  lastPerformedOn: IsoDate | undefined,
  lastPerformed: IsoDate | undefined,
  today: IsoDate,
): LimitOutcome {
  const anchor = laterIsoDate(lastPerformedOn, lastPerformed);
  if (anchor === undefined) {
    return { kind: 'never-performed' };
  }
  const dueOn = addMonths(anchor, months);
  // IsoDates compare correctly as strings ('YYYY-MM-DD' is lexicographic).
  const kind = today < dueOn ? 'ok' : today === dueOn ? 'due' : 'overdue';
  return { kind, basis: 'calendar', lastPerformedOn: anchor, dueOn };
}

/**
 * The distance limit's outcome (issue #32): anchored solely off a logged Distance
 * reading and measured against the rig's current Distance, never the calendar.
 * With no completion it is `never-performed`; with a completion but no yardstick
 * (no rig Distance, or the newest completion recorded none) it is `reading-needed`.
 */
function distanceOutcome(
  km: number,
  lastPerformedOn: IsoDate | undefined,
  rigDistanceKm: number | undefined,
  lastReadingKm: number | undefined,
): LimitOutcome {
  if (lastPerformedOn === undefined) {
    return { kind: 'never-performed' };
  }
  if (rigDistanceKm === undefined || lastReadingKm === undefined) {
    return { kind: 'reading-needed' };
  }
  const dueAtKm = lastReadingKm + km;
  // Due once the rig reaches the reading it was last done at plus the interval.
  const kind =
    rigDistanceKm < dueAtKm
      ? 'ok'
      : rigDistanceKm === dueAtKm
        ? 'due'
        : 'overdue';
  return { kind, basis: 'distance', dueAtKm, currentKm: rigDistanceKm };
}

/**
 * The due/overdue status for one task, from its {@link DueStatusInput} context.
 *
 * An interval carries up to two limits (ADR-0016); each is evaluated on read and
 * the task's overall standing is the **more urgent** of the concrete ones —
 * "whichever elapses first". A limit that can't be evaluated is skipped, so a
 * combined task whose distance limit has no yardstick still reads its calendar
 * standing. `reading-needed` surfaces only when distance is the *sole* limit;
 * otherwise, with no concrete standing at all, the task is `never-performed`.
 */
export function dueStatus({
  interval,
  lastPerformedOn,
  today,
  isOneTime = false,
  lastPerformed,
  rigDistanceKm,
  lastReadingKm,
}: DueStatusInput): DueStatus {
  if (isOneTime) {
    return { kind: 'one-time' };
  }
  if (interval === undefined) {
    return { kind: 'untracked' };
  }
  const calendar =
    interval.months === undefined
      ? undefined
      : calendarOutcome(interval.months, lastPerformedOn, lastPerformed, today);
  const distance =
    interval.km === undefined
      ? undefined
      : distanceOutcome(
          interval.km,
          lastPerformedOn,
          rigDistanceKm,
          lastReadingKm,
        );

  // The overall standing is the more urgent of the concrete ones — "whichever
  // elapses first". Calendar is considered first, so it wins an exact tie.
  let best: Standing | undefined;
  for (const outcome of [calendar, distance]) {
    if (
      outcome !== undefined &&
      isStanding(outcome) &&
      (best === undefined || URGENCY[outcome.kind] > URGENCY[best.kind])
    ) {
      best = outcome;
    }
  }
  if (best !== undefined) {
    return best;
  }
  // No limit produced a concrete standing. A sole distance limit surfaces its own
  // nudge (`reading-needed` or `never-performed`); every other case (a calendar
  // limit present, or both limits unevaluated) reads `never-performed`.
  if (calendar === undefined && distance !== undefined) {
    return distance;
  }
  return { kind: 'never-performed' };
}

/**
 * The later of two optional IsoDates, or `undefined` when both are absent — the
 * `max(lastPerformed, newest entry)` a calendar interval anchors off (issue #33).
 * IsoDates compare correctly as strings ('YYYY-MM-DD' is lexicographic).
 */
function laterIsoDate(
  a: IsoDate | undefined,
  b: IsoDate | undefined,
): IsoDate | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return a >= b ? a : b;
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

/**
 * The narrow task shape `dueStatusOf` needs — only the fields the due-status
 * assembly reads, not the full MaintenanceTask. This lets the MCP layer (and
 * any future consumer) call the function without depending on the full entity.
 */
export interface DueStatusTaskInput {
  readonly interval?: Interval | undefined;
  readonly oneTime?: true | undefined;
  readonly lastPerformed?: IsoDate | undefined;
}

/**
 * The entry shape `dueStatusOf` reads — the two fields the due-status helpers
 * need from each log entry: the date it was performed on and an optional
 * Distance reading.
 */
export interface DueStatusEntryInput {
  readonly performedOn: IsoDate;
  readonly distanceKm?: number | undefined;
}

/**
 * Compute a task's {@link DueStatus} from its log entries, the rig's current
 * Distance, and today's date. This is the shared assembly that gathers the
 * inputs {@link dueStatus} needs — calling {@link latestPerformedOn} and
 * {@link latestReadingKm} on the entries, conditionally spreading the one-time
 * marker (exactOptionalPropertyTypes), and delegating.
 *
 * Both web callsites and the future MCP layer use this instead of duplicating
 * the assembly inline (ADR-0023).
 */
export function dueStatusOf(
  task: DueStatusTaskInput,
  entries: readonly DueStatusEntryInput[],
  rigDistanceKm: number | undefined,
  today: IsoDate,
): DueStatus {
  return dueStatus({
    interval: task.interval,
    lastPerformedOn: latestPerformedOn(entries),
    today,
    ...(task.oneTime && { isOneTime: task.oneTime }),
    lastPerformed: task.lastPerformed,
    rigDistanceKm,
    lastReadingKm: latestReadingKm(entries),
  });
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

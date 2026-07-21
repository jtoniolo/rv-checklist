import type { IsoDate } from './common.js';
import type { Interval } from './maintenance-task.js';

/**
 * A task's due/overdue standing, computed on read from its last completion and
 * interval (ADR-0005) — never stored, never scheduled, never notified. A task
 * with no interval is simply not tracked; one with an interval but no log entry
 * yet has no basis for a due date, so it reads as never-performed.
 */
export type DueStatus =
  | { readonly kind: 'untracked' }
  | { readonly kind: 'never-performed' }
  | {
      readonly kind: 'ok' | 'due' | 'overdue';
      readonly lastPerformedOn: IsoDate;
      readonly dueOn: IsoDate;
    };

/**
 * The due/overdue status for one task: `interval` from the task,
 * `lastPerformedOn` from its newest log entry (see {@link latestPerformedOn}),
 * `today` supplied by the caller so the computation stays pure.
 */
export function dueStatus(
  interval: Interval | undefined,
  lastPerformedOn: IsoDate | undefined,
  today: IsoDate,
): DueStatus {
  if (interval === undefined) {
    return { kind: 'untracked' };
  }
  if (lastPerformedOn === undefined) {
    return { kind: 'never-performed' };
  }
  const dueOn = addMonths(lastPerformedOn, interval.months);
  // IsoDates compare correctly as strings ('YYYY-MM-DD' is lexicographic).
  const kind = today < dueOn ? 'ok' : today === dueOn ? 'due' : 'overdue';
  return { kind, lastPerformedOn, dueOn };
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

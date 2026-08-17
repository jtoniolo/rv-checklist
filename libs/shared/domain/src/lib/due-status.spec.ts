import {
  addMonths,
  dueStatus,
  dueStatusOf,
  latestPerformedOn,
  latestReadingKm,
} from './due-status.js';

const calendar = (months: number) => ({ months });
const distance = (km: number) => ({ km });
const both = (months: number, km: number) => ({ months, km });

describe('dueStatus — computed on read from last completion + interval (ADR-0005)', () => {
  it('is untracked with no interval, even when the task has been performed', () => {
    expect(
      dueStatus({
        interval: undefined,
        lastPerformedOn: '2026-01-15',
        today: '2026-07-21',
      }),
    ).toEqual({ kind: 'untracked' });
    expect(
      dueStatus({
        interval: undefined,
        lastPerformedOn: undefined,
        today: '2026-07-21',
      }),
    ).toEqual({ kind: 'untracked' });
  });

  it('is never-performed with a calendar interval but no completion yet', () => {
    expect(
      dueStatus({
        interval: calendar(12),
        lastPerformedOn: undefined,
        today: '2026-07-21',
      }),
    ).toEqual({ kind: 'never-performed' });
  });

  // A one-time task is due from creation and done once (issue #29): it always
  // needs attention, short-circuiting the interval arithmetic. It never carries
  // an interval, and completing it deletes it, so no completion ever ages it.
  it('is one-time when the task is flagged one-time', () => {
    expect(
      dueStatus({
        interval: undefined,
        lastPerformedOn: undefined,
        today: '2026-07-21',
        isOneTime: true,
      }),
    ).toEqual({ kind: 'one-time' });
  });

  // Parity with the pre-basis engine (ADR-0015 phase A — zero behaviour change):
  // an existing 12-month task computes exactly as before. The boundary (issue
  // #17): last done 2025-07-21, every 12 months ⇒ due on 2026-07-21. The day
  // before is ok, the day itself is due, the day after is overdue.
  it('is ok strictly before the due date', () => {
    expect(
      dueStatus({
        interval: calendar(12),
        lastPerformedOn: '2025-07-21',
        today: '2026-07-20',
      }),
    ).toEqual({
      kind: 'ok',
      basis: 'calendar',
      lastPerformedOn: '2025-07-21',
      dueOn: '2026-07-21',
    });
  });

  it('is due on exactly the due date', () => {
    expect(
      dueStatus({
        interval: calendar(12),
        lastPerformedOn: '2025-07-21',
        today: '2026-07-21',
      }),
    ).toEqual({
      kind: 'due',
      basis: 'calendar',
      lastPerformedOn: '2025-07-21',
      dueOn: '2026-07-21',
    });
  });

  it('is overdue past the due date', () => {
    expect(
      dueStatus({
        interval: calendar(12),
        lastPerformedOn: '2025-07-21',
        today: '2026-07-22',
      }),
    ).toEqual({
      kind: 'overdue',
      basis: 'calendar',
      lastPerformedOn: '2025-07-21',
      dueOn: '2026-07-21',
    });
  });
});

// The manual last-performed anchor (issue #33): an owner's hand-set date, needing
// no completion, anchors a calendar interval. A real completion always supersedes
// it — the engine anchors off the *later* of the two, `max(lastPerformed, entry)`.
describe('dueStatus — manual last-performed anchor (issue #33)', () => {
  it('anchors a calendar interval off the manual date when there is no completion', () => {
    // No Log Entry, but the owner set last-performed to 2025-07-21; 12 months
    // ⇒ due 2026-07-21, so on 2026-07-22 it is overdue — not never-performed.
    expect(
      dueStatus({
        interval: calendar(12),
        lastPerformedOn: undefined,
        lastPerformed: '2025-07-21',
        today: '2026-07-22',
      }),
    ).toEqual({
      kind: 'overdue',
      basis: 'calendar',
      lastPerformedOn: '2025-07-21',
      dueOn: '2026-07-21',
    });
  });

  it('reports due/ok from the manual anchor with no completion', () => {
    expect(
      dueStatus({
        interval: calendar(12),
        lastPerformedOn: undefined,
        lastPerformed: '2025-07-21',
        today: '2026-07-20',
      }),
    ).toEqual({
      kind: 'ok',
      basis: 'calendar',
      lastPerformedOn: '2025-07-21',
      dueOn: '2026-07-21',
    });
  });

  it('lets a newer completion override an earlier manual anchor', () => {
    // Manual anchor 2025-07-21, but a completion on 2026-01-15 is later, so the
    // due date is measured from the completion: due 2027-01-15, ok on 2026-07-22.
    expect(
      dueStatus({
        interval: calendar(12),
        lastPerformedOn: '2026-01-15',
        lastPerformed: '2025-07-21',
        today: '2026-07-22',
      }),
    ).toEqual({
      kind: 'ok',
      basis: 'calendar',
      lastPerformedOn: '2026-01-15',
      dueOn: '2027-01-15',
    });
  });

  it('keeps the manual anchor when it is later than the newest completion', () => {
    // The manual anchor is the later of the two, so it wins over an older entry.
    expect(
      dueStatus({
        interval: calendar(12),
        lastPerformedOn: '2024-01-01',
        lastPerformed: '2025-07-21',
        today: '2026-07-20',
      }),
    ).toEqual({
      kind: 'ok',
      basis: 'calendar',
      lastPerformedOn: '2025-07-21',
      dueOn: '2026-07-21',
    });
  });

  it('is never-performed with a calendar interval and neither anchor', () => {
    expect(
      dueStatus({
        interval: calendar(12),
        lastPerformedOn: undefined,
        lastPerformed: undefined,
        today: '2026-07-21',
      }),
    ).toEqual({ kind: 'never-performed' });
  });
});

// A distance task (issue #32) is measured against the rig's Distance, not the
// calendar. It anchors off the newest completion's Distance reading and is due
// once the rig reaches that reading plus the interval; with no rig Distance or
// no reading on the newest completion, there is no yardstick, so it reads
// `reading-needed`. `today` is irrelevant to a distance task.
describe('dueStatus — distance basis (issue #32)', () => {
  it('is never-performed with a distance interval but no completion yet', () => {
    expect(
      dueStatus({
        interval: distance(20_000),
        lastPerformedOn: undefined,
        today: '2026-07-21',
        rigDistanceKm: 38_200,
        lastReadingKm: undefined,
      }),
    ).toEqual({ kind: 'never-performed' });
  });

  it('is reading-needed when the rig has no current Distance', () => {
    expect(
      dueStatus({
        interval: distance(20_000),
        lastPerformedOn: '2026-01-15',
        today: '2026-07-21',
        rigDistanceKm: undefined,
        lastReadingKm: 20_000,
      }),
    ).toEqual({ kind: 'reading-needed' });
  });

  it('is reading-needed when the newest completion carries no reading', () => {
    expect(
      dueStatus({
        interval: distance(20_000),
        lastPerformedOn: '2026-01-15',
        today: '2026-07-21',
        rigDistanceKm: 38_200,
        lastReadingKm: undefined,
      }),
    ).toEqual({ kind: 'reading-needed' });
  });

  // Last done at 20,000 km, every 20,000 km ⇒ due at 40,000 km. Before that
  // reading it is ok; at it, due; past it, overdue.
  it('is ok before the rig reaches the due reading', () => {
    expect(
      dueStatus({
        interval: distance(20_000),
        lastPerformedOn: '2026-01-15',
        today: '2026-07-21',
        rigDistanceKm: 38_200,
        lastReadingKm: 20_000,
      }),
    ).toEqual({
      kind: 'ok',
      basis: 'distance',
      dueAtKm: 40_000,
      currentKm: 38_200,
    });
  });

  it('is due at exactly the due reading', () => {
    expect(
      dueStatus({
        interval: distance(20_000),
        lastPerformedOn: '2026-01-15',
        today: '2026-07-21',
        rigDistanceKm: 40_000,
        lastReadingKm: 20_000,
      }),
    ).toEqual({
      kind: 'due',
      basis: 'distance',
      dueAtKm: 40_000,
      currentKm: 40_000,
    });
  });

  it('is overdue past the due reading', () => {
    expect(
      dueStatus({
        interval: distance(20_000),
        lastPerformedOn: '2026-01-15',
        today: '2026-07-21',
        rigDistanceKm: 41_500,
        lastReadingKm: 20_000,
      }),
    ).toEqual({
      kind: 'overdue',
      basis: 'distance',
      dueAtKm: 40_000,
      currentKm: 41_500,
    });
  });
});

// A combined interval (ADR-0016) carries both limits and is due on whichever
// elapses first: the overall standing is the *more urgent* of the two present
// limits' standings (overdue on either wins; due beats ok). A limit that can't
// be evaluated is skipped, not surfaced.
describe('dueStatus — combined limits, whichever elapses first (ADR-0016)', () => {
  // Calendar overdue (due 2026-07-21, today past it) vs distance still ok
  // (due at 40,000 km, rig at 38,200). Overdue wins.
  it('reports overdue when the calendar limit is overdue and distance is ok', () => {
    expect(
      dueStatus({
        interval: both(12, 20_000),
        lastPerformedOn: '2025-07-21',
        today: '2026-07-22',
        rigDistanceKm: 38_200,
        lastReadingKm: 20_000,
      }),
    ).toEqual({
      kind: 'overdue',
      basis: 'calendar',
      lastPerformedOn: '2025-07-21',
      dueOn: '2026-07-21',
    });
  });

  // Distance overdue (due at 40,000 km, rig at 41,500) vs calendar still ok
  // (due 2026-07-21, today before it). Overdue wins, on the distance basis.
  it('reports overdue when the distance limit is overdue and calendar is ok', () => {
    expect(
      dueStatus({
        interval: both(12, 20_000),
        lastPerformedOn: '2025-07-21',
        today: '2026-07-20',
        rigDistanceKm: 41_500,
        lastReadingKm: 20_000,
      }),
    ).toEqual({
      kind: 'overdue',
      basis: 'distance',
      dueAtKm: 40_000,
      currentKm: 41_500,
    });
  });

  // Calendar due today vs distance ok — due beats ok.
  it('reports due when one limit is due and the other is ok', () => {
    expect(
      dueStatus({
        interval: both(12, 20_000),
        lastPerformedOn: '2025-07-21',
        today: '2026-07-21',
        rigDistanceKm: 38_200,
        lastReadingKm: 20_000,
      }),
    ).toEqual({
      kind: 'due',
      basis: 'calendar',
      lastPerformedOn: '2025-07-21',
      dueOn: '2026-07-21',
    });
  });

  // Both ok — a tie in urgency resolves to the calendar limit (evaluated first).
  it('resolves an ok/ok tie to the calendar standing', () => {
    expect(
      dueStatus({
        interval: both(12, 20_000),
        lastPerformedOn: '2025-07-21',
        today: '2026-07-20',
        rigDistanceKm: 38_200,
        lastReadingKm: 20_000,
      }),
    ).toEqual({
      kind: 'ok',
      basis: 'calendar',
      lastPerformedOn: '2025-07-21',
      dueOn: '2026-07-21',
    });
  });

  // Both overdue — a tie in urgency still resolves to the calendar standing.
  it('resolves an overdue/overdue tie to the calendar standing', () => {
    expect(
      dueStatus({
        interval: both(12, 20_000),
        lastPerformedOn: '2025-07-21',
        today: '2026-07-22',
        rigDistanceKm: 41_500,
        lastReadingKm: 20_000,
      }),
    ).toEqual({
      kind: 'overdue',
      basis: 'calendar',
      lastPerformedOn: '2025-07-21',
      dueOn: '2026-07-21',
    });
  });

  // No distance yardstick (rig has no current Distance), but the calendar limit
  // can still be evaluated: the task reads its calendar standing, NOT reading-needed.
  it('falls back to the calendar standing when distance has no yardstick', () => {
    expect(
      dueStatus({
        interval: both(12, 20_000),
        lastPerformedOn: '2025-07-21',
        today: '2026-07-22',
        rigDistanceKm: undefined,
        lastReadingKm: undefined,
      }),
    ).toEqual({
      kind: 'overdue',
      basis: 'calendar',
      lastPerformedOn: '2025-07-21',
      dueOn: '2026-07-21',
    });
  });

  // Never performed and no manual anchor: neither limit can be evaluated, so the
  // task is never-performed — not reading-needed (distance is not the sole limit).
  it('is never-performed when a combined task has no completion or anchor', () => {
    expect(
      dueStatus({
        interval: both(12, 20_000),
        lastPerformedOn: undefined,
        today: '2026-07-21',
        rigDistanceKm: 38_200,
        lastReadingKm: undefined,
      }),
    ).toEqual({ kind: 'never-performed' });
  });
});

describe('addMonths', () => {
  it('keeps the day when the target month has it', () => {
    expect(addMonths('2025-07-21', 12)).toBe('2026-07-21');
    expect(addMonths('2026-03-15', 1)).toBe('2026-04-15');
  });

  it('clamps to the end of a shorter month rather than rolling over', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-08-31', 1)).toBe('2026-09-30');
  });

  it('crosses a year boundary', () => {
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });
});

describe('latestPerformedOn', () => {
  it('is undefined with no entries', () => {
    expect(latestPerformedOn([])).toBeUndefined();
  });

  it('picks the newest performed-on date regardless of order', () => {
    expect(
      latestPerformedOn([
        { performedOn: '2026-03-01' },
        { performedOn: '2026-07-04' },
        { performedOn: '2025-12-31' },
      ]),
    ).toBe('2026-07-04');
  });
});

describe('latestReadingKm', () => {
  it('is undefined with no entries', () => {
    expect(latestReadingKm([])).toBeUndefined();
  });

  it('returns the Distance reading of the newest completion, regardless of order', () => {
    expect(
      latestReadingKm([
        { performedOn: '2026-03-01', distanceKm: 18_000 },
        { performedOn: '2026-07-04', distanceKm: 22_500 },
        { performedOn: '2025-12-31', distanceKm: 12_000 },
      ]),
    ).toBe(22_500);
  });

  it('is undefined when the newest completion carries no reading, even if an older one does', () => {
    expect(
      latestReadingKm([
        { performedOn: '2026-03-01', distanceKm: 18_000 },
        { performedOn: '2026-07-04' },
      ]),
    ).toBeUndefined();
  });
});

// dueStatusOf — the shared assembly function that gathers a task's log entries,
// rig distance, and today's date, then delegates to dueStatus(). Extracts the
// duplicated pattern from the two web callsites into libs/shared/domain so the
// MCP layer (ADR-0023) can share it.
describe('dueStatusOf — shared enrichment from (task, entries, rig distance, today)', () => {
  it('computes a calendar overdue standing from entries and a task interval', () => {
    expect(
      dueStatusOf(
        { interval: calendar(12) },
        [{ performedOn: '2025-07-21' }],
        undefined,
        '2026-07-22',
      ),
    ).toEqual({
      kind: 'overdue',
      basis: 'calendar',
      lastPerformedOn: '2025-07-21',
      dueOn: '2026-07-21',
    });
  });

  it('computes a distance ok standing from entries and the rig distance', () => {
    expect(
      dueStatusOf(
        { interval: distance(20_000) },
        [{ performedOn: '2026-01-15', distanceKm: 20_000 }],
        38_200,
        '2026-07-21',
      ),
    ).toEqual({
      kind: 'ok',
      basis: 'distance',
      dueAtKm: 40_000,
      currentKm: 38_200,
    });
  });

  it('picks the more urgent limit from a combined interval', () => {
    expect(
      dueStatusOf(
        { interval: both(12, 20_000) },
        [{ performedOn: '2025-07-21', distanceKm: 20_000 }],
        41_500,
        '2026-07-20',
      ),
    ).toEqual({
      kind: 'overdue',
      basis: 'distance',
      dueAtKm: 40_000,
      currentKm: 41_500,
    });
  });

  it('returns one-time for a task flagged one-time', () => {
    expect(dueStatusOf({ oneTime: true }, [], undefined, '2026-07-21')).toEqual(
      { kind: 'one-time' },
    );
  });

  it('returns untracked for a task with no interval and no one-time marker', () => {
    expect(dueStatusOf({}, [], undefined, '2026-07-21')).toEqual({
      kind: 'untracked',
    });
  });

  it('returns reading-needed for a distance-only task with no rig distance', () => {
    expect(
      dueStatusOf(
        { interval: distance(20_000) },
        [{ performedOn: '2026-01-15' }],
        undefined,
        '2026-07-21',
      ),
    ).toEqual({ kind: 'reading-needed' });
  });

  it('returns never-performed for a calendar task with no entries', () => {
    expect(
      dueStatusOf({ interval: calendar(12) }, [], undefined, '2026-07-21'),
    ).toEqual({ kind: 'never-performed' });
  });

  it('anchors off the manual lastPerformed when no entries exist', () => {
    expect(
      dueStatusOf(
        { interval: calendar(12), lastPerformed: '2025-07-21' },
        [],
        undefined,
        '2026-07-20',
      ),
    ).toEqual({
      kind: 'ok',
      basis: 'calendar',
      lastPerformedOn: '2025-07-21',
      dueOn: '2026-07-21',
    });
  });

  it('picks the newest entry when multiple are present', () => {
    expect(
      dueStatusOf(
        { interval: calendar(12) },
        [{ performedOn: '2025-01-01' }, { performedOn: '2025-07-21' }],
        undefined,
        '2026-07-20',
      ),
    ).toEqual({
      kind: 'ok',
      basis: 'calendar',
      lastPerformedOn: '2025-07-21',
      dueOn: '2026-07-21',
    });
  });
});

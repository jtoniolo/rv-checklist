# 16. An interval carries both limits, and the task is due at the first limit that elapses

Date: 2026-07-25

## Status

Accepted.

This ADR amends [0015](0015-multi-basis-maintenance-intervals.md). The primary
decisions of that ADR do not change. The intervals still have more than one
basis, the application still stores the inputs to the due status, and it still
calculates the due status on a read.

One item changes. The two bases are no longer mutually exclusive.

## Context

ADR-0015 made `Interval` a tagged union on a `basis` field. The application
tracked a task by calendar months *or* by Distance km, and never by both.

That model is incorrect for a real distance schedule. The service of a trailer
axle has this specification: "every 2 years **or** 30,000 km, whichever comes
first."

Each limit has a purpose. The calendar limit finds the rig that moves a small
distance and stays in one location for the full season. The distance limit finds
the rig that moves a large distance and never waits two years.

One basis loses one half of each such specification. Also, the "Track by" control
in the user interface made the owner select one limit and lose the other limit.

## Decision

- **`Interval` is no longer a tagged union. It becomes one object with two
  optional limits.** The limits are an optional calendar cadence, in `months`,
  and an optional distance cadence, in `km`.

  A minimum of **one** limit must be present. If both limits are absent, the
  application does not track the task. This is the same as a task with no
  interval today. The `basis` field is removed.
- **The task is due at the first limit that elapses.** The application evaluates
  each present limit on a read, the same as before. The status of the task is the
  *more urgent* of the two results. An `overdue` result on either limit makes the
  task overdue. A `due` result replaces an `ok` result. This is "whichever comes
  first", in terms of a status.
- **The application skips a limit that it cannot evaluate. It does not show a
  message.** A distance limit needs a rig Distance and a reading in the log for
  its anchor.

  A task can carry **both** limits while the application cannot evaluate the
  distance limit. In that condition the calendar limit controls the status, and
  the task reads a real `ok`, `due`, or `overdue`. It does not read
  `reading-needed`.

  The `reading-needed` status remains for one condition only. It applies to a
  task whose *only* limit is a distance limit and that has no measure. This
  narrows the message from ADR-0015.
- **The manual `lastPerformed` anchor keeps its meaning.** It anchors the
  **calendar** limit. It now applies to each interval that carries a calendar
  limit. This is true also when the same interval carries a distance limit. The
  distance limit still anchors on the reading in the log only.
- **The one-time marker stays mutually exclusive with the full interval.** This
  does not change from ADR-0015. Only the exclusivity between the calendar limit
  and the distance limit is removed.
- **The storage keeps the typed columns of ADR-0015, but loses the `basis`
  column.** `interval_months` and `interval_km` remain, and both can be null.
  `interval_basis` is removed.

  A row with no limit is not tracked. The migration reads each existing row with
  `basis = 'calendar'` as a row with months only. It reads each existing row with
  `basis = 'distance'` as a row with km only. Thus no data is lost.

## Alternatives that we compared

- **A list of intervals on a task.** We rejected this alternative. No task needs
  more than one calendar limit and one distance limit. A list makes the due-status
  read, the form, and the storage more complex. It gives a general function that
  has no use here.
- **Keep `reading-needed` also when a calendar limit can give an answer.** We
  rejected this alternative. A task with a calendar cadence that operates always
  has a status. Thus a request for a reading is noise. Request a reading only when
  the distance limit is the only limit that tracks the task.

## Consequences

- One statement of ADR-0015 is no longer correct: "`Interval` is a tagged union,
  with the calendar basis or the distance basis, but not both". Each other part
  of ADR-0015 stays correct.
- `DueStatus` no longer names a single `basis`. A task with both limits reports
  the status of the limit that wins. The display can show the numbers of both
  limits, so that the owner sees which limit drives the status.
- The "Track by" control is removed. Two independent optional cadence fields
  replace it. An empty field is an absent limit.
- The migration removes `interval_basis`. It changes the rule from "the calendar
  basis or the distance basis, but not both" to "a minimum of one limit is
  present". The rule between the one-time marker and the interval does not
  change.

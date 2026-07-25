# 16. An Interval carries both limits, due on whichever elapses first

Date: 2026-07-25

## Status

Accepted

Amends [0015](0015-multi-basis-maintenance-intervals.md). That ADR's core —
multi-basis intervals, stored due-status inputs, pull-based read-time due — is
unchanged. What changes is that the two bases are no longer mutually exclusive.

## Context

ADR-0015 modelled `Interval` as a tagged union on `basis`: a task tracked *either*
by calendar months *or* by Distance km, never both. That is wrong for how real
distance schedules read. Trailer-axle service is specced "every 2 years **or**
30,000 km, whichever comes first" — the calendar catches the low-mileage rig that
sits all season, the distance catches the high-mileage rig that never waits two
years. Forcing a single basis drops half of each such spec, and the UI's "Track
by" selector made the owner pick one and lose the other.

## Decision

- **`Interval` stops being a tagged union and becomes one object with two optional
  limits:** an optional calendar cadence (`months`) and an optional distance
  cadence (`km`). **At least one** must be present; both absent means the task is
  untracked (the same as no interval today). The `basis` discriminator is gone.
- **Due is whichever limit elapses first.** Each present limit is evaluated on
  read as before; the task's overall standing is the *more urgent* of them (an
  `overdue` on either limit makes the task overdue; `due` beats `ok`). "Whichever
  comes first" in status terms.
- **A limit that can't be evaluated is skipped, not surfaced as a nag.** A
  distance limit needs a rig Distance and a logged reading to anchor from. When a
  task carries **both** limits but distance can't be evaluated, the calendar limit
  governs and the task reads a real `ok`/`due`/`overdue` — no `reading-needed`.
  `reading-needed` remains only for a task whose *sole* limit is distance and has
  no yardstick (ADR-0015's nudge, narrowed).
- **The manual `lastPerformed` anchor is unchanged in meaning:** it anchors the
  **calendar** limit, and now rides with any interval that carries one (whether or
  not the same interval also carries a distance limit). The distance limit still
  anchors solely off the logged reading.
- **The one-time marker stays mutually exclusive with the interval as a whole** —
  unchanged from ADR-0015. Only calendar-vs-distance exclusivity is dropped.
- **Persistence keeps ADR-0015's typed columns, minus the discriminator.**
  `interval_months` and `interval_km` remain, both nullable; `interval_basis` is
  dropped. A row with neither is untracked; the migration reads existing
  `basis = 'calendar'` rows as month-only and `basis = 'distance'` rows as
  km-only, so no data is lost.

## Alternatives considered

- **A set/list of intervals on a task** — rejected: nothing needs more than one
  calendar and one distance limit, and a list complicates the due read, the form,
  and persistence for generality that earns nothing here.
- **Keep `reading-needed` even when a calendar limit could answer** — rejected: a
  task with a working calendar cadence is never in the dark, so nagging for a
  reading is noise. Nudge only when distance is the *only* thing tracking it.

## Consequences

- ADR-0015's "`Interval` is a tagged union, calendar XOR distance" no longer
  holds; everything else in 0015 stands.
- `DueStatus` no longer tags a single `basis`; a combined task reports the winning
  limit's standing (and may show both limits' numbers so the owner sees which one
  is driving).
- The "Track by" form control is removed in favour of two independent optional
  cadence fields; a blank field is an absent limit.
- Migration drops `interval_basis` and lifts the calendar-XOR-distance invariant
  to "at least one limit present"; the one-time-vs-interval invariant is untouched.

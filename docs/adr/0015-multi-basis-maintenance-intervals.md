# 15. Maintenance intervals with more than one basis, and stored inputs to the due status

Date: 2026-07-23

## Status

Accepted.

This ADR amends [0005](0005-pull-based-no-notifications.md). In that ADR an
interval was a number of whole months, and the due status had "no stored state".

The primary decision of ADR-0005 does not change. The application is pull-based,
sends no notification, has no scheduler, and calculates the due status on a read.

## Context

Each maintenance task in the starter content had one value: `intervalMonths: 12`.

We did research against primary sources that are not commercial. Refer to
`docs/research/2026-07-23-towable-rv-maintenance-intervals.md`. That research
shows that a value in months is incorrect for approximately half of the tasks:

- Some tasks are **distance-based**. The makers of a trailer axle specify the
  service of the wheel bearings and the adjustment of the brakes by the distance
  that the trailer moved. They do not use the calendar.
- Some tasks are **replacements by age**, on a clock of several years. The clock
  starts at a manufacture date, not at the last performance of the task. Examples
  are a smoke alarm at approximately 10 years, the recertification of a propane
  cylinder at 12 years, and the removal of a tire at approximately 6 years.
- Some tasks are **driven by an event**. Examples are "before every trip" and
  "after any wheel removal". The model already holds these tasks as checklist
  steps, and it does not track them as tasks.
- A small number of tasks are **seasonal**. Examples are the winterization each
  fall and the de-winterization and sanitization each spring.

The owner also wants to set the next due date of a task manually.

ADR-0005 fixed the interval as a number of whole months. It also stated that the
due status is "a calculation at the time of a read. It is not a stored value."

To hold a recurrence that the calendar does not drive, and to hold a manual
anchor, we need a larger interval and a small quantity of new stored input.

## Decision

- **The `Interval` becomes a tagged union with two bases.** The bases are
  `calendar`, in whole months, and `distance`, in whole kilometres. The union is
  intentionally small. We can add a basis later, such as the `hours` of an
  engine, without new work on the existing bases.
- **An item that an event drives is not an interval.** Such an item continues to
  be a checklist step. A step already carries the state in a run that "before
  every trip" needs.

  An `event` basis would repeat that function. It would also force a status that
  can never become overdue, and that status has no meaning.
- **A season is not a basis.** A season is a `calendar` interval, and its
  last-performed date is its anchor. Thus the 12-month clock of the winterization
  falls in the fall.

  This prevents a map of the months of the Northern hemisphere in the engine that
  calculates the due status.
- **A task gets an optional manual `lastPerformed` date.** For a calendar
  interval, the effective anchor is the *later* of that date and the newest Log
  Entry. A real completion always replaces the manual estimate. The manual date
  cannot move the anchor earlier than a completion in the log. To correct that
  condition, correct the log.

  This field covers a manual adjustment, an anchor to a season, and a replacement
  by age. For a replacement by age, the anchor is the manufacture date. This
  field applies to a calendar interval only.
- **A rig gets an optional current `distance` in km.** The owner keeps this value
  now. A trip logger in the future will supply it.

  **A Log Entry gets an optional `distance` reading in km** at the time of the
  work. This is the anchor from which a distance interval measures. It replaces
  the `odometer` custom field of the starter content.
- **The application still calculates the due status on a read.** ADR-0005 stays
  correct. We store new *inputs*: `lastPerformed`, the rig distance, and the
  reading on an entry. We never store the status.

  A distance task can be performed while the rig has no current distance. That
  task reads **`reading-needed`**. It does not read "ok" without a message.
- **The storage uses typed columns, not JSONB.** The task gets
  `interval_basis`, `interval_months`, `interval_km`, and `last_performed`. The
  rig gets `distance_km`. The log entry gets `at_distance_km`.

  With two scalar members, the columns stay easy to query. They also agree with
  the method that the entity already uses to flatten the interval. The migration
  is this rule: `interval_months = N` becomes `basis = 'calendar'`.
- **The units are metric, in km. The model does not record the type of the rig.**
  The distance serves a towable rig, which records the towed km, and a driveable
  rig, which records the odometer km. The run-hours of an engine and the task for
  an onboard generator are out of scope.

## Alternatives that we compared

- **Keep the months and correct the numbers only.** We rejected this alternative.
  It cannot hold a task that is distance-based, a task that is age-based, or a
  task with more than one cadence.
- **A model with five bases**: calendar, seasonal, distance, hours, and event. We
  rejected this alternative. The `event` basis repeats the checklist steps. The
  `seasonal` basis is a calendar basis with an anchor. No task in scope uses the
  `hours` basis. Thus we kept only the bases that give a benefit.
- **A JSONB `interval` column.** We rejected this alternative for two members.
  Typed columns are more simple, they are easy to query, and they are a smaller
  change from the single integer column of today.
- **A distance that the application asks for at each visit, or a passive display
  with no calculated status.** We rejected these alternatives. The owner selected
  a stored rig distance, so that a distance task gives a real due status and
  overdue status.
- **A manual due date that replaces the calculation.** In this alternative the
  owner fixes the due date directly. We rejected it. We prefer a new anchor on
  "last performed", because the interval then continues correctly after the next
  completion.

## Consequences

- Two statements of ADR-0005 are no longer correct: "an interval is a number of
  whole months" and "there is no stored value". The due status is still a
  calculation at the time of a read. But it now reads the stored inputs
  `lastPerformed` and the rig distance, in addition to the log.

  The primary decision of ADR-0005 does not change. The application is
  pull-based, sends no notification, and has no scheduler.
- A task with more than one cadence becomes more than one starter task, and each
  one has a single interval. An example is "test the alarms each month" and
  "replace the alarm every 10 years".
- A replacement by age is an ordinary calendar task. Its anchor is a
  `lastPerformed` value that holds the manufacture date. There is no separate
  concept of an age.
- The migrations change three tables: the task, the rig, and the log entry. Each
  existing task becomes `basis = 'calendar'` and keeps its current value in
  months.
- The **Instructions** field, in Markdown, tells *how* to do a task, and it is
  different from `description`. That field is a separate change. This ADR does
  **not** cover it.

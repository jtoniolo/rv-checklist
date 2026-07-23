# 15. Multi-basis maintenance intervals and stored due-status inputs

Date: 2026-07-23

## Status

Accepted

Amends [0005](0005-pull-based-no-notifications.md) (intervals were "whole
months"; due-status kept "no stored state"). ADR-0005's core — pull-based, no
notifications, no scheduler, due computed on read — is unchanged.

## Context

Every seed maintenance task shipped with a flat `intervalMonths: 12`. Research
against primary, non-commercial sources (`docs/research/2026-07-23-towable-rv-maintenance-intervals.md`)
showed that is wrong for roughly half of them:

- Some are **distance-based** — trailer-axle makers spec wheel-bearing service
  and brake adjustment by distance travelled, not the calendar.
- Some are **age-based replacements** on a multi-year clock anchored to a
  manufacture date (smoke alarm ~10 yr, propane cylinder recert 12 yr, tire
  retirement ~6 yr) rather than to when they were last "done".
- Some are **event-driven** ("before every trip", "after any wheel removal") —
  which are already modelled as checklist Steps, not tracked tasks.
- A few are **seasonal** (winterize each fall, de-winterize/sanitize each spring).

The owner also wanted to set a task's next due date by hand. ADR-0005 fixed the
interval as whole months and stated due-status is "a read-time computation, not
stored state." Representing non-calendar recurrence and a manual anchor requires
both a richer interval and a small amount of new stored input.

## Decision

- **`Interval` becomes a tagged union with two bases:** `calendar` (whole
  months) and `distance` (whole kilometres). The union is deliberately minimal
  and left open to extension (e.g. engine `hours`) without rework.
- **Event-driven items are not intervals** — they stay checklist Steps, which
  already carry the run-state ("before every trip") they need. Adding an `event`
  interval would duplicate that and force a meaningless never-overdue status.
- **Seasonal is not a basis** — a season is a `calendar` interval anchored by its
  last-performed date (winterize's 12-month clock set to land in fall). This
  avoids baking a Northern-hemisphere month map into the due engine.
- **A task gains an optional manual `lastPerformed` date.** The effective anchor
  for a calendar interval is the *later* of it and the newest Log Entry; a real
  completion always supersedes the manual guess. It cannot force the anchor
  earlier than a logged completion (fix the log instead). It covers manual
  tuning, season-anchoring, and age-based replacements (anchor = manufacture
  date). Calendar intervals only.
- **A rig gains an optional current `distance` (km),** owner-maintained now, and
  the intended feed for a future trip logger. **A Log Entry gains an optional
  `distance` reading (km)** at the time performed — the anchor a distance
  interval measures from (replacing the seed's ad-hoc `odometer` custom field).
- **Due-status is still computed on read** (ADR-0005 upheld). We store new
  *inputs* — `lastPerformed`, rig distance, entry reading — never the status. A
  distance task that has been performed but whose rig has no current distance set
  reads **`reading-needed`**, not a silent "ok".
- **Persistence is typed columns, not JSONB:** `interval_basis`,
  `interval_months`, `interval_km`, `last_performed` on the task; `distance_km`
  on the rig; `at_distance_km` on the log entry. At two scalar members this stays
  queryable and matches how the entity already flattens the interval; the
  migration is `interval_months = N → basis = 'calendar'`.
- **Units are metric (km); rig type is not modelled.** Distance serves a towable
  rig (towed km) or a driveable one (odometer km) alike. Engine run-hours and the
  onboard-generator task are out of scope.

## Alternatives considered

- **Keep flat months, just correct the numbers** — rejected: cannot represent
  distance-based, age-based, or multi-cadence tasks at all.
- **Full five-basis model (calendar / seasonal / distance / hours / event)** —
  rejected: `event` duplicates checklist Steps, `seasonal` reduces to calendar +
  anchor, and `hours` has no in-scope task. Kept the union to what earns its
  place.
- **JSONB `interval` column** — rejected at two members; typed columns are
  simpler, queryable, and a smaller change from today's single int column.
- **Read-time-only distance (prompt each visit) or passive display without a
  computed status** — rejected: the owner chose a stored rig distance so distance
  tasks compute a real due/overdue.
- **Manual due as an absolute override** (pin the due date directly) — rejected
  in favour of re-anchoring "last performed", so the interval resumes cleanly
  after the next completion.

## Consequences

- ADR-0005's "interval is whole months" and "no stored state" no longer hold:
  due-status is still read-time, but now reads from stored inputs
  (`lastPerformed`, rig distance) in addition to the log. Its core decision
  (pull-based, no notifications, no scheduler) is untouched.
- Multi-cadence tasks (e.g. "test alarms monthly" vs "replace alarm every 10
  years") are split into separate single-interval seed tasks.
- Age-based replacements are ordinary calendar tasks anchored via `lastPerformed`
  = manufacture date; no dedicated "age" concept exists.
- Migrations touch three tables (task, rig, log entry). Existing tasks convert to
  `basis = 'calendar'` with their current month value.
- The markdown **Instructions** field (task *how*, distinct from `description`)
  is a separate change and is **not** covered by this ADR.

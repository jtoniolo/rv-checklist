# Multi-basis maintenance intervals — design

**Date:** 2026-07-23
**Status:** Approved (brainstorming + grilling complete)
**ADR:** [0015](../../adr/0015-multi-basis-maintenance-intervals.md)
**Source of truth for intervals:** `docs/research/2026-07-23-towable-rv-maintenance-intervals.md`

## Problem

Every seed maintenance task ships at a flat `intervalMonths: 12`. That is wrong
for ~half of them: some are distance-based, some are multi-year age-based
replacements, some are event-driven (and belong on checklists), a few are
seasonal. The owner also wants to set a task's next due date by hand. See
ADR-0015 for the decision and the alternatives weighed.

## Scope

**In:** enrich the interval model to calendar + distance, add a manual
"last performed" anchor, add owner-maintained rig distance and a per-log-entry
distance reading, extend the due engine, and rewrite the seed content from the
research (metric).

**Out (tracked separately):**
- The markdown **Instructions** field (task *how*, distinct from *why*) — its own
  small change/issue.
- Engine run-hours / onboard-generator task.
- Trip-logger auto-feed of rig distance (this design only adds the manual field
  it will later populate).

## Model

`Interval` becomes a tagged union, validated in `libs/shared/domain`:

```ts
type Interval =
  | { basis: 'calendar'; months: number }   // whole months, positive
  | { basis: 'distance'; km: number };       // whole kilometres, positive
```

New optional inputs (glossary terms in `CONTEXT.md`):

- **Task `lastPerformed`** — a date. Manual anchor for a *calendar* interval.
  Effective anchor = **later of** `lastPerformed` and the newest Log Entry's
  `performedOn`. Never rides with a distance interval or the one-time marker.
- **Rig `distance`** — current km, owner-maintained.
- **Log Entry `distance`** — km reading at the time performed (replaces the
  seed's `odometer` custom field).

Invariants (Zod `.refine`, mirroring today's interval⊕oneTime guard):
- `interval` and `oneTime` stay mutually exclusive.
- `lastPerformed` only with a `calendar` interval.

## Due engine (`libs/shared/domain/due-status.ts`)

`dueStatus` grows to take: the interval, the newest log entry (`performedOn` +
optional `distance`), the task's `lastPerformed`, `today`, and the rig's current
`distance`. It stays pure — the caller supplies everything.

| Basis | Anchor | Due condition | Missing-input status |
|-------|--------|---------------|----------------------|
| calendar | later of `lastPerformed` / newest entry | `today ≥ addMonths(anchor, months)` | no anchor → `never-performed` |
| distance | newest entry's `distance` | `rig.distance ≥ entryDistance + km` | entry has no reading, or rig has no distance → `reading-needed` |

`DueStatus` kinds: `untracked`, `one-time`, `never-performed`, `ok` / `due` /
`overdue`, and the new **`reading-needed`**. (No `as-needed` — event items are
checklist Steps. No seasonal logic — seasonal is calendar + `lastPerformed`.)

`addMonths` is unchanged. Distance comparison is plain integer arithmetic.

## Persistence (`libs/api/data-access`)

Typed columns (ADR-0015), one migration:

- `maintenance_tasks`: keep `interval_months`; add `interval_basis`
  (`'calendar' | 'distance'`, null when untracked), `interval_km` (int null),
  `last_performed` (date null).
- `rigs`: add `distance_km` (int null).
- `log_entries`: add `at_distance_km` (int null).
- Data migration: existing `interval_months = N` → `interval_basis = 'calendar'`.
  Reversible down-migration drops the new columns and the basis flag.

## API (`apps/api`)

- DTOs / wire schemas carry the `Interval` union, `lastPerformed`, rig
  `distance`, and log-entry `distance`.
- `UpdateMaintenanceTask` gains `lastPerformed` (nullable to clear) and the
  distance interval; the service keeps interval⊕oneTime exclusivity and drops
  `lastPerformed` if a change leaves it without a calendar interval.
- Rig update gains `distance`. Log-entry create/update gains `distance`.
- `dueStatus` reads now pass the rig distance through (the maintenance read
  already resolves the rig for ownership — ADR-0006).

## Web (`apps/web`)

- **Task form:** basis picker → months field or km field; a "last performed"
  date control (calendar basis only).
- **Rig screen:** editable current **distance** (km).
- **Log form:** optional distance reading (km).
- **Maintenance list:** render the new statuses — `reading-needed` ("set the
  rig's distance to track this"), and distance due ("due at 40,000 km — you're at
  38,200 km").

## Seed rewrite (`apps/api/.../seed`, `docs/seed-content.md`)

Regenerate `docs/seed-content.md` from the research (the old doc is discarded),
then transcribe into `seed-content.ts`:

- Assign each task its real basis + interval; **convert imperial specs to metric**
  (bearings ~20,000 km, brakes ~5,000 km, tread depth → mm). Tire-pressure unit
  (psi vs kPa) is an owner call at transcription time.
- **Split multi-cadence tasks** into single-interval tasks (e.g. "Test smoke / CO
  / LP alarms" monthly vs "Replace smoke alarm" 120 months).
- **Age-based replacements** ship as calendar tasks; the owner anchors them via
  `lastPerformed` = manufacture date (no seed value).
- **Cut the generator task.** Event-driven items (lug re-torque, safety chains,
  breakaway) are **not** tasks — verify they exist as Steps in the Departure /
  Pre-trip checklists, add any missing.

## Testing (TDD, per phase)

- **Domain (first):** `due-status.spec.ts` — calendar anchor precedence
  (`max(lastPerformed, entry)`), distance due/overdue, `reading-needed` when the
  rig or entry lacks a reading, exclusivity refinements. `maintenance-task.spec.ts`
  — union parse/reject, `lastPerformed`-without-calendar rejection.
- **Persistence:** migration up/down; `interval_months → calendar` conversion.
- **API:** service specs for the new update paths and exclusivity dropping.
- **Web:** task-form basis switching, list rendering of new statuses.
- **Seed:** `seed-content.spec.ts` updated to the new task set.

## Phasing

Each phase is independently reviewable; earlier phases unblock later ones.

- **A — Domain:** `Interval` union, `lastPerformed`, extended `dueStatus`. Pure, TDD.
- **B — Persistence:** entities + migration + repositories.
- **C — API:** DTOs, service, controllers.
- **D — Web:** task form, rig distance, log reading, list statuses.
- **E — Seed:** regenerate the doc, transcribe metric task set, reconcile checklists.

## Open at transcription time (not blocking)

- Tire-pressure unit (psi vs kPa).
- Exact rounded metric interval values (research gives the source specs).

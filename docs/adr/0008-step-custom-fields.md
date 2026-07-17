# 8. Steps may carry custom fields, reusing the task field model

Date: 2026-07-17

## Status

Accepted

Extends ADR-0004's field model to checklist steps.

## Context

Plain steps sometimes want a recorded value — a count of items, fresh-water
level at departure and return (to learn per-trip usage). The custom-field
mechanism (JSONB `field_schema`, copy-with-values) already exists for
maintenance tasks; the question was add it to steps now or retrofit later.

## Decision

- A **plain step may define its own `field_schema`** — same shape, types
  (`text | note | number | boolean | date | photo`), and validation as tasks
  (ADR-0004, ADR-0007).
- Completing the step in a run **captures the values onto the run's copy of
  the step** — the same copy-with-values pattern log entries use. Values stay
  editable, like everything else.
- **A task-linked step never defines its own fields.** Its fields come from
  the referenced task and land in the log entry, as already decided. This
  avoids two competing field sources on one step.

## Alternatives considered

- **Defer to post-MVP** — rejected. The mechanism is being built once for
  tasks anyway; mounting it in a second place now is marginal cost, versus a
  retrofit plus data migration later.
- **Allow a task-linked step to add its own fields on top of the task's** —
  rejected; two field sources on one step muddies where values live and what a
  log entry means.

## Consequences

- Run steps carry schema+value copies; the run remains the sole record of
  plain-step values (no log entry involved).
- The field-capture UI is one shared component used for log entries and run
  steps alike.

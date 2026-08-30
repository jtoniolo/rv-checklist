# 8. A step can carry custom fields, with the field model of a task

Date: 2026-07-17

## Status

Accepted.

This ADR extends the field model of ADR-0004 to the checklist steps.

## Context

A plain step sometimes needs a recorded value. Examples are a count of items and
the fresh-water level at the departure and at the return. The owner can then
learn the quantity that each trip uses.

The mechanism for a custom field already exists for the maintenance tasks. It
uses a JSONB `field_schema` value and a copy that holds the values.

The question was this: do we add the mechanism to the steps now, or do we add it
later?

## Decision

- A **plain step can define its own `field_schema`**. It uses the same shape, the
  same types, and the same validation as a task. The types are `text`, `note`,
  `number`, `boolean`, `date`, and `photo`. Refer to ADR-0004 and ADR-0007.
- When the user completes the step in a run, the application **records the values
  on the copy of the step in that run**. This is the same copy-with-values
  pattern that a log entry uses. The values stay editable, the same as the other
  data.
- **A step that links to a task never defines its own fields.** Its fields come
  from the task, and they go into the log entry. We decided this earlier. This
  rule prevents two sources of fields on one step.

## Alternatives that we compared

- **Do this work after the MVP.** We rejected this alternative. We build the
  mechanism one time for the tasks. To use it in a second location now adds
  little cost. To add it later needs new work and a data migration.
- **Let a step that links to a task add its own fields to the fields of the
  task.** We rejected this alternative. Two sources of fields on one step make
  the location of the values unclear. They also make the meaning of a log entry
  unclear.

## Consequences

- A run step carries a copy of the schema and the values. The run is the only
  record of the values of a plain step. There is no log entry.
- One shared component captures the fields. The log entries and the run steps
  both use that component.

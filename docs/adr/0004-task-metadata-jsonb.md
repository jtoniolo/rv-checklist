# 4. Task metadata as JSONB, with snapshot-to-log

Date: 2026-07-16

## Status

Accepted

## Context

Tasks need user-defined custom fields (e.g. tire pressure, product used) that are
typed and may carry a unit. The metadata definition is **part of what defines a
task** — each task owns its own fields; fields are *not* a library shared and
referenced across tasks. Two storage approaches were weighed: normalize the
fields/values across tables, or store them as JSONB.

## Decision

- **Field definitions live in JSONB on the task** — a `field_schema` array. They
  are owned by exactly one task and read with it, so they are embedded, not put
  in a shared `field_definition` table.
- **Field shape** — each field has:
  - `name` — text, **unique within the task**, the **only** user-facing
    identifier (no separate "key" is surfaced).
  - `type` — one of `text | note | number | boolean | date`.
  - `required` — yes/no.
  - `unit` — optional text, meaningful only for `number`.
- **UI mapping** — `boolean` renders as **Yes/No**; `number` shows value + unit.
- **Recorded values** — a completion (log entry) stores a **snapshot** of the
  task's `field_schema` plus a `value` per field. Values are stored as their
  native JSON type.

```json
// task.field_schema
[ { "name": "Tire Pressure", "type": "number", "required": true, "unit": "psi" } ]

// log_entry.fields  (snapshot + value)
[ { "name": "Tire Pressure", "type": "number", "required": true, "unit": "psi", "value": 32 } ]
```

## Alternatives considered

- **Normalized EAV** (`field_definition` + `field_value` tables) — rejected.
  Access is read-mostly and entity-local; EAV pays a join-and-pivot tax on the
  most common operation and handles per-field types awkwardly. Cross-record
  value queries (the EAV strength) are not a primary need; a GIN index or
  promoting a hot field to a real column covers the rare case.
- **Shared field-definition table** — rejected; fields are task-owned, not a
  reusable cross-task library.

## Consequences

- **Snapshot-to-log gives per-entry versioning for free:** editing a task's
  fields later never rewrites history — each log entry stays honest about what it
  asked and what was answered that day ("what was the spec when I last did
  this?").
- **Validation is app-enforced.** JSONB cannot carry a uniqueness or type
  constraint, so the API validates the field shape and enforces "no duplicate
  field names within a task" on save.
- Any internal slug the code needs may be derived from `name`, but it is never
  surfaced; `name` is the identifier in the domain language.
- Occasional filtering on values uses a GIN index; sustained reporting on a
  field would justify promoting it to a real column.

## Open

Whether a plain checklist step (a label with no fields) is modelled as a task
with no schema or a distinct item type, and whether snapshot-to-log applies to
plain ticks or only maintenance completions, are domain-model questions tracked
in issue #2 / `CONTEXT.md`, not this ADR.

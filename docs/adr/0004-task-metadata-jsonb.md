# 4. Task metadata as JSONB, copied into the log

Date: 2026-07-16

## Status

Accepted.

## Context

A task needs custom fields that the user defines. Examples are the tire pressure
and the product that the user applied. Each field has a type and can have a unit.

The definition of the metadata is **part of the definition of the task**. Each
task owns its own fields. The fields are *not* a library that more than one task
uses.

We compared two methods of storage. The first method makes normalized tables for
the fields and the values. The second method keeps them as JSONB.

## Decision

- **The field definitions are in a JSONB value on the task.** The value is a
  `field_schema` array. One task owns the definitions, and the application reads
  them with the task. Thus the definitions are in the task, and not in a shared
  `field_definition` table.
- **The shape of a field.** Each field has these four properties:
  - `name`: text. It is **unique in the task**. It is the **only** identifier
    that the user sees. The application does not show a separate key.
  - `type`: one of `text`, `note`, `number`, `boolean`, or `date`.
  - `required`: yes or no.
  - `unit`: optional text. It has a meaning for the `number` type only.
- **The user interface.** A `boolean` field shows **Yes** or **No**. A `number`
  field shows the value and the unit.
- **The recorded values.** A completion makes a log entry. That entry stores a
  **copy** of the `field_schema` of the task, and it adds a `value` to each
  field. The application stores each value in its native JSON type.

```json
// task.field_schema
[ { "name": "Tire Pressure", "type": "number", "required": true, "unit": "psi" } ]

// log_entry.fields  (snapshot + value)
[ { "name": "Tire Pressure", "type": "number", "required": true, "unit": "psi", "value": 32 } ]
```

## Alternatives that we compared

- **A normalized EAV structure**, with a `field_definition` table and a
  `field_value` table. We rejected this alternative. The access is mostly a read,
  and it stays in one entity. EAV needs a join and a pivot for that most frequent
  operation, and it holds a different type for each field with difficulty.

  EAV is good at a query for one value across many records. We do not need that
  query. For the small number of times when we do need it, a GIN index is
  sufficient. We can also move a frequently-read field into a real column.
- **A shared table of field definitions.** We rejected this alternative. A task
  owns its fields. The fields are not a library that more than one task uses.

## Consequences

- **The copy in the log gives a version for each entry, at no cost.** A later
  change to the fields of a task never changes the history. Each log entry
  continues to show the questions of that day and the answers of that day. Thus
  the owner can answer the question "What was the specification when I last did
  this?"
- **The application does the validation.** JSONB cannot carry a constraint for
  uniqueness or for a type. Thus the API validates the shape of each field. On a
  save, the API also refuses two fields with the same name in one task.
- The code can calculate an internal slug from `name`. The application never
  shows that slug. In the language of the domain, `name` is the identifier.
- For the small number of filters on a value, use a GIN index. If a report reads
  one field continuously, move that field into a real column.

## Open questions

Two questions remain. Is a plain checklist step, which is a label with no fields,
a task with no schema or a different type of object? And does the copy-to-log
rule apply to a plain step, or to a maintenance completion only?

These are questions about the domain model. Issue #2 and `CONTEXT.md` track them.
This ADR does not answer them.

# 17. Task tags as a denormalized text array

Date: 2026-07-26

## Status

Accepted

## Context

Issue #41 adds tags to maintenance tasks: an optional, user-defined set of short
labels for filtering and organizing. The two standard persistence shapes are a
**join table** (`tasks_tags` with a `tags` reference table) or a **denormalized
array column** (`tags text[]` on the task row).

Tags here are simple strings with no metadata (no description, no colour, no
hierarchy). There is no cross-rig query ("show me all tags across all my rigs"),
no tag-centric view, and no referential-integrity requirement on tag values.
The set is small (a handful per task) and free-form.

## Decision

- **Store tags as a `text[]` column on `maintenance_tasks`**, not a join table.
- **Canonical form (trim + lowercase) is what gets stored**, end-to-end. No
  separate "display form" diverges from the stored form. Deduplication is a
  string equality check, not a case-insensitive collation.
- **Canonicalization is enforced in the domain schema** (Zod transform): the
  `TagSchema` trims and lowercases on parse, and the `TagsSchema` rejects
  duplicates after canonicalization. The UI also canonicalizes before adding
  (re-selecting an existing tag instead of creating a duplicate), so the schema
  is a safety net, not the only line of defense.
- **The repository maps SQL `NULL` to `[]`** on read; on write, an empty array
  writes `NULL` so old rows and tagless tasks stay uniform.

## Alternatives considered

- **Join table** (`task_tags` + `tags` reference table) — rejected: it buys
  referential integrity on tag values, but there is nothing to be integral
  *with* — tags are free-form strings, not a controlled vocabulary. A join table
  adds a table, a migration, a repository method, and an eager-load concern for
  generality this feature does not need.
- **JSONB array** — rejected in favour of native `text[]`: Postgres text arrays
  support `@>` containment for the AND filter, and the values are plain strings,
  not objects.

## Consequences

- No `Tag` entity, no `TagRepository`. Tags travel as part of the
  `MaintenanceTask` aggregate — read, written, and deleted with it.
- Renaming a tag across tasks is a client-side batch update, not a single
  reference-table rename. Acceptable for the expected scale.
- The AND filter is client-side (the task list is already fully loaded for
  due-status computation). If the list ever moves to server-side pagination, the
  `text[] @> ARRAY[...]` operator supports it without a schema change.

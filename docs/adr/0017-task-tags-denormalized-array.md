# 17. Task tags as a denormalized text array

Date: 2026-07-26

## Status

Accepted.

## Context

Issue #41 adds tags to the maintenance tasks. A tag set is optional, the user
defines it, and it holds short labels for a filter and for organization.

There are two usual methods to store tags:

- A **join table**. This is a `tasks_tags` table and a `tags` reference table.
- A **denormalized array column**. This is a `tags text[]` column on the row of
  the task.

Here a tag is a simple string with no other data. It has no description, no
colour, and no hierarchy.

There is no query across more than one rig. Thus the application never answers
"show me all the tags of all my rigs". There is no view that centers on the tags.
There is also no requirement for referential integrity on a tag value.

The set is small. A task has a small number of tags, and the format is free.

## Decision

- **Store the tags as a `text[]` column on `maintenance_tasks`.** Do not use a
  join table.
- **Store the canonical form.** The canonical form removes the spaces at the ends
  and makes the letters lowercase. The application uses this form from the input
  to the storage. There is no separate display form that differs from the stored
  form. The removal of a duplicate is a comparison of two strings. It does not
  need a collation that ignores the case of the letters.
- **The domain schema applies the canonical form**, with a Zod transform. The
  `TagSchema` removes the spaces and makes the letters lowercase during the
  parse. The `TagsSchema` then refuses a duplicate.

  The user interface also makes the canonical form before it adds a tag. It then
  selects an existing tag and does not make a duplicate. Thus the schema is a
  protection, and it is not the only protection.
- **The repository changes a SQL `NULL` value to `[]` on a read.** On a write, an
  empty array becomes `NULL`. Thus an old row and a task with no tags have the
  same value.

## Alternatives that we compared

- **A join table**, with a `task_tags` table and a `tags` reference table. We
  rejected this alternative. It gives referential integrity on the tag values.
  But there is no controlled vocabulary to be integral *with*, because a tag is a
  free-form string.

  A join table also adds a table, a migration, a method on the repository, and a
  decision about an eager load. It gives a general function that this feature does
  not need.
- **A JSONB array.** We rejected this alternative and selected the native
  `text[]` type. A Postgres text array supports the `@>` containment operator for
  the AND filter. Also, each value is a plain string and not an object.

## Consequences

- There is no `Tag` entity and no `TagRepository`. The tags are part of the
  `MaintenanceTask` aggregate. The application reads them, writes them, and
  deletes them with that aggregate.
- To change the name of a tag on more than one task, the client sends a batch
  update. There is no single change to a name in a reference table. This is
  acceptable for the expected quantity of data.
- The client applies the AND filter. The task list is already fully loaded, for
  the calculation of the due status.

  If the list later moves to pagination on the server, the `text[] @> ARRAY[...]`
  operator supports that filter. The schema then needs no change.

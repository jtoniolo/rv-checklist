# Domain Docs

This file tells the engineering skills how to use the domain documentation of
this repository. Read this file before you explore the code.

## Read these files first

- `CONTEXT.md` at the root of the repository. Or:
- `CONTEXT-MAP.md` at the root, if that file exists. It points to one
  `CONTEXT.md` for each context. Read each context that applies to the topic.
- `docs/adr/`. Read the architecture decision records that apply to your work
  area. If the repository has more than one context, also look in
  `src/<context>/docs/adr/` for decisions that apply to one context.

If a file in this list does not exist, continue your work. Do not report the
missing file. Do not propose to create the file.

The `/domain-modeling` skill creates these files when a term or a decision
becomes clear. You can start that skill from `/grill-with-docs` and from
`/improve-codebase-architecture`.

## File structure

A repository with one context. Most repositories use this structure:

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

A repository with more than one context. `CONTEXT-MAP.md` is at the root:

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← decisions for the full system
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← decisions for one context
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## When to divide a large CONTEXT.md

Start with one context. Divide the root `CONTEXT.md` when one of these
conditions becomes true:

- The file is longer than a small number of screens.
- The file mixes the vocabulary of two separate areas. An example is ordering
  terms next to billing terms.
- You must scroll past sections that do not apply, to find the sections that
  apply.

Do not let the file continue to grow. To divide the file:

1. Find the separate contexts in the file. A context is one bounded area of the
   domain.
2. Create one `CONTEXT.md` for each context at `src/<context>/CONTEXT.md`. Use
   the structure that the section above shows. Move the vocabulary and the
   decisions of each area into its own file.
3. Replace the root `CONTEXT.md` with a `CONTEXT-MAP.md`. This file lists the
   contexts and points to each `CONTEXT.md`.
4. Move each ADR that applies to one context into `src/<context>/docs/adr/`.
   Keep each ADR that applies to the full system in the root `docs/adr/`.

Divide the file early. A context that you can read from start to end is more
useful than one large document. Give this work to `/domain-modeling`. That skill
controls the structure of these files.

## Use the vocabulary of the glossary

Your output can name a domain concept. This can occur in an issue title, a
refactor proposal, a hypothesis, or a test name. Use the term with the
definition that `CONTEXT.md` gives. Do not change to a synonym that the glossary
rejects.

The glossary can be missing a concept that you need. This condition shows one of
two problems. Possibly you invented language that the project does not use, and
you must think again. Possibly the glossary has a true gap, and you must record
the gap for `/domain-modeling`.

## Report a conflict with an ADR

If your output disagrees with an ADR, report the conflict. Do not replace the
decision without a report.

> This contradicts ADR-0007 (event-sourced orders). Open the decision again,
> because...

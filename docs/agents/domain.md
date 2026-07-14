# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (most repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## When to split a growing CONTEXT.md

Start single-context. When the root `CONTEXT.md` gets too big to hold in your head — it has grown past a few screens, mixes vocabulary from clearly separate areas (e.g. ordering terms next to billing terms), or you keep scrolling past irrelevant sections to find the ones you need — **split it into multiple contexts** rather than letting it keep growing.

To split:

1. Identify the distinct contexts (bounded areas of the domain) the single file has accumulated.
2. Create a per-context `CONTEXT.md` for each — under `src/<context>/CONTEXT.md`, matching the multi-context layout above — and move each area's vocabulary and decisions into its own file.
3. Replace the root `CONTEXT.md` with a `CONTEXT-MAP.md` that lists the contexts and points at each `CONTEXT.md`.
4. Move any context-specific ADRs into `src/<context>/docs/adr/`; leave system-wide ones in the root `docs/adr/`.

Prefer splitting early over carrying one oversized file — a context you can read end-to-end is worth more than one exhaustive document. When a split is warranted, hand it to `/domain-modeling`, which owns the structure of these files.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

# CLAUDE.md

Commit to main.

## Language standard

Write all Markdown files in this repository in ASD-STE100 Simplified Technical
English. This rule applies to every Markdown file, whatever its purpose. It
includes agent instruction files, skill files, and architecture decision
records.

## Agent skills

### Issue tracker

This project records issues and PRDs as GitHub Issues in the
`jtoniolo/rv-checklist` repository. Use the `gh` CLI to read and write them.
Refer to `docs/agents/issue-tracker.md`.

### Triage labels

This project uses five triage labels: `needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, and `wontfix`. Refer to
`docs/agents/triage-labels.md`.

### Domain docs

This project has one context. The domain documents are `CONTEXT.md` and the
files in `docs/adr/`. Both are at the root of the repository.

If `CONTEXT.md` becomes too large, divide it into one file for each context.
Refer to `docs/agents/domain.md`.

[ADR-0018](docs/adr/0018-true-hybrid-ssr-web-architecture.md) records the SSR
architecture. It covers true hybrid SSR, Pattern C data seeding, and rig-scoped
routes.

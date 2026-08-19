# 23. MCP tool surface

Date: 2026-08-17

## Status

Accepted

Amended by ADR-0027 (trips and stops tools: the roster grows to 23, and
`mark_stop_arrived` writes the rig's Distance as a service-owned side
effect).

## Decision drivers

The MCP server (ADR-0021) needed its tool surface defined: which tools,
at what granularity, and how due/overdue maintenance reaches the agent.
Ticket #69 on wayfinder map #64 resolved it. The deciding insight came
from the owner: the agent's value is the long, tedious authoring work —
building and reorganizing checklists, designing bespoke maintenance
tasks, tuning intervals to low usage, creating one-time tasks — not
operating the app. This narrows the map's original "full UI parity"
destination, which the owner withdrew as over-broad.

## Decision

- **Scope**: authoring and advising, not operating. Reads on every
  resource; writes on checklists and maintenance tasks only. No writes
  to rigs, runs, or log entries — the owner updates Distance, works
  through runs, and records performed maintenance in the UI.
- **Granularity**: one tool per service operation, thin wrappers over
  the existing owner-scoped services. No coarse composite tools: the
  checklist update already replaces the full ordered step list, so
  "reorganize this checklist" is a single call, and the agent chains
  reads itself.
- **Roster — 15 tools.** Reads (9): `list_rigs`, `get_rig`,
  `list_checklists` (by rig), `get_checklist`, `list_runs` (by
  checklist or rig), `get_run`, `list_maintenance_tasks` (by rig),
  `get_maintenance_task`, `list_log_entries` (by task or rig). Writes
  (6): `create_checklist`, `update_checklist`, `delete_checklist`,
  `create_maintenance_task`, `update_maintenance_task`,
  `delete_maintenance_task`. No `get_log_entry` — entries are small and
  the list returns them whole.
- **Due status**: the task read tools compute `dueStatus` server-side
  with the shared domain function (the same one the web client calls)
  and attach it to every task returned. The agent never re-derives it.
  No separate "what's due" tool — an annotated list filters trivially.
- **Naming and descriptions**: `verb_noun` snake_case, domain language
  from `CONTEXT.md` (rig, checklist, step, run, maintenance task, log
  entry — never RV, vehicle, template, schedule, mileage). Descriptions
  state the rules the agent cannot guess: update replaces the
  checklist's full ordered step list; interval and one-time are
  mutually exclusive; Distance is kilometres; a task-linked step takes
  its fields from the task.
- **Primitives**: tools only. No MCP resources or prompts.

## Alternatives considered

- **Full UI parity (~25 tools, all writes)** — withdrawn by the owner:
  run/log-entry writes serve jobs (checking steps off, recording
  maintenance) the owner does not want delegated.
- **Coarse task-oriented tools** ("start a run", "record maintenance")
  — rejected: the wanted coarse operations coincide with the existing
  CRUD shapes, and the operating-the-app composites target the
  descoped jobs.
- **A dedicated due-maintenance tool** — rejected: schedule tuning
  needs status on every task, not only the due ones, so annotating the
  reads subsumes it.
- **MCP resources / prompts** — rejected for now: reads cover the same
  data, client support for resources is uneven, and the owner's jobs
  are conversational, not canned templates. Either can be added later
  without breakage.

## Consequences

- Each tool passes `ownerId` (resolved from the `rvmcp_` token,
  ADR-0022) as the first argument to the existing service — no new
  service code for writes.
- The MCP task reads need a small enrichment step (task + log entries +
  rig Distance → `dueStatus`) that today lives in the web client;
  implementation should place it where both can share it.
- Tool input schemas derive from the existing Zod schemas in
  `libs/shared/domain`.
- Adding run or log-entry writes later is additive — new tools, no
  changes to these.

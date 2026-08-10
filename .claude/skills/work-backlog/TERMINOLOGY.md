# Terminology

The words `work-backlog` uses for its own machinery. Read alongside `SKILL.md`.
Frontier, claiming, and blocking-edge mechanics are defined in
`docs/agents/issue-tracker.md` and are not restated here.

## Units of work

**Run**
One invocation of the skill. A run is N **loops** — the argument, else 10.

**Loop**
The budget unit. One loop is one **wave**. A run of 10 loops therefore runs up
to 10 waves, and with a cap of 3 attempts up to 30 tickets.

**Wave**
Up to **3** tickets worked in parallel, each in its own **worktree**. Three is
the default cap; a different cap arrives as an instruction in the invocation,
not as a flag. The wave **joins** — every ticket in it finishes its rounds —
before anything merges.

**Round**
One try at one ticket, inside that ticket's worktree: a **work round** followed
by a **review round**. A failed review starts another round. Rounds repeat up to
10 tries, after which the ticket is handed forward.

A wave contains tickets. A ticket contains rounds. Rounds are never parallel
with each other — only tickets are.

## Roles

**Orchestrator**
The main agent. It plans nothing and implements nothing. It creates worktrees,
reserves any numbers that would otherwise collide across a wave (ADR filenames),
dispatches agents, runs the gate, and writes the report.

**Planner**
Reads the whole frontier and returns the wave: up to 3 tickets it judges safe to
run beside each other, plus a brief per ticket. It fixes any shared contract the
tickets would otherwise each invent, and records what it fixed and why it thinks
the tickets are independent. It may return **fewer** than the cap. It may never
return more.

**Worker**
Implements one ticket in that ticket's worktree. Returns its branch name and a
summary of what it did.

**Reviewer**
Checks one ticket, in that ticket's worktree, **before** the merge. Independent
of the orchestrator: it verifies every acceptance criterion by running it. The
verdict is pass or fail.

**Merger**
Merges each passing branch into `main`, one at a time, running the gate after
each. A red gate names its own culprit, because the merge before it was green.
The merger fixes the red gate.

## Checks

**Gate**
Exactly `npx nx run-many -t typecheck lint test` from the repo root.

**Final review**
One code review per run, outside every wave and every round, after all of them
are done. Its findings become a **new ticket** — they never reopen a closed one.

## Worktrees

A worktree belongs to a **ticket**, not to an agent. Every agent working that
ticket — each work round, each review round, each rework — uses the same one. A
ticket handed forward keeps its worktree, so the next run inherits the work
rather than restarting it.

Worktrees are removed in one step, at the very end, and only when the final
review passed and started nothing further. Only the worktrees of **closed**
tickets are removed.

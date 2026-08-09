---
name: work-backlog
description: Ralph-loop the ready-for-agent frontier — each loop claims one ticket and drives it relentlessly toward a green, committed, closed state (default 3 loops, override with an argument).
disable-model-invocation: true
---

# Work Backlog

Clear the **frontier** — open `ready-for-agent` issues with no open blockers and no assignee — as a **Ralph loop**. A run is N loops (the argument, else **10**); each loop claims exactly one ticket and drives toward shipping it. A stubborn ticket may consume several loops: each failed loop leaves its work in the tree and its findings on the ticket, unclaims, and the next loop re-claims and continues — progress accumulates across loops instead of restarting. Frontier query, claiming, and blocking-edge mechanics live in `docs/agents/issue-tracker.md`.

Work on the current branch, one loop at a time.

**The main agent is an orchestrator, nothing more**: it claims, dispatches sub-agents, verifies the gate, commits, and reports. All implementation and all review happen inside **fresh sub-agents, one per round** — that is what keeps the orchestrator's context thin enough to survive every loop of the run at full intelligence.

## Per loop

1. **Claim** the lowest-numbered frontier ticket and read its full body **and comments** — earlier loops leave their failure logs there, and continuing from them (and from the work earlier rounds already committed or left in the tree) is the point. Empty frontier → go straight to the report.
2. **Work round — one sub-agent.** Dispatch a fresh work sub-agent that invokes **`/implement <ticket>`** — that skill owns the how (test-first at pre-agreed seams, typecheck cadence, its own review pass, committing to the current branch). Brief the sub-agent with the ticket's comment history, the state of the tree, and (on later rounds) the previous review round's findings to fix. It returns a summary of the change and the commits it made.
3. **Review round — another sub-agent.** Dispatch the two-axis `/code-review` flow (Standards + Spec sub-agents, the ticket as spec, the loop's commits as subject) as an independent check with fresh eyes. The verdict is binary: **pass** (no confirmed findings) or **fail** (findings listed).
4. **Fail → another round.** Findings go back around: a fresh work round fixes them, a fresh review round re-reviews. Rounds repeat up to **10 tries** within the loop — a red gate or failed review is the start of the next round, not an exit.
5. **Pass → ship.** The orchestrator re-runs the full gate itself, then closes the issue with a comment naming the loop's commits and what shipped.
6. **Out of tries.** Comment a failure log on the ticket — what was tried, the exact failing output, and a concrete hypothesis for the next attempt — then unclaim (remove the assignee). Leave the commits and working tree exactly as they stand: the next loop inherits the work and the log. The loop is spent.
7. **`ready-for-human`** — reserved for a ticket that genuinely needs a human: a product decision, missing credentials or access, a spec that contradicts itself. Comment the specific question a human must answer, swap the label, unassign. Difficulty is never the trigger — hard is what the rounds are for.

## Report

End the run with a status report in **exactly** the format below — no sections added, renamed, or dropped (write `None.` under an empty one). Print it to screen **and** write the identical markdown to `.reports/work-backlog-<YYYY-MM-DD-HHMM>.md` (the directory is gitignored; create it if absent).

```markdown
# work-backlog run — <YYYY-MM-DD HH:MM>

Loops: <used>/<budget> · Shipped: <n> · Handed forward: <n> · ready-for-human: <n>

## Shipped

- #<ticket> — <title> — `<sha>`[, `<sha>`…] — <one sentence on what was built>

## Not landed

- #<ticket> — <title> — <handed forward after N tries | ready-for-human> — <next step per the failure log / the question asked>

## For the human

- <each ready-for-human question, unpushed commits awaiting push, and anything noticed that needs an owner's decision — one bullet each>

## Frontier

- #<ticket> — <title> [— blocked by #<n>…]
```

Leave pushing, and the parent spec/map issues, to the human.

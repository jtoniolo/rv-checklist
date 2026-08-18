---
name: work-backlog
description: Ralph-loop the ready-for-agent frontier — each loop works a wave of up to three independent tickets in parallel, driving each toward a green, merged, closed state (default 10 loops, override with an argument).
disable-model-invocation: true
---

# Work Backlog

Clear the **frontier** — open `ready-for-agent` issues with no open blockers and no assignee — as a **Ralph loop**. A run is N loops (the argument, else **10**); each loop is a **wave** of up to **three** tickets worked in parallel, one worktree per ticket. A stubborn ticket may consume several loops: each failed round leaves its work in that ticket's worktree and its findings on the ticket, unclaims, and a later wave re-claims and continues — progress accumulates across loops instead of restarting. Frontier query, claiming, and blocking-edge mechanics live in `docs/agents/issue-tracker.md`.

**Read `TERMINOLOGY.md` first.** Run, loop, wave, round, and the five roles below each mean one specific thing, and a wave nests differently from a round.

Three is the default cap on a wave. A different cap arrives as an instruction in the invocation, never as a flag.

**The main agent is an orchestrator, nothing more**: it creates worktrees, dispatches sub-agents, closes tickets, and reports. All planning, all implementation, all review, and all merging happen inside **fresh sub-agents** — that is what keeps the orchestrator's context thin enough to survive every loop of the run at full intelligence.

The **gate** is exactly `npx nx run-many -t typecheck lint test` from the repo root. Nothing else is the gate.

**The orchestrator has nothing to do with acceptance criteria — full stop.** It does not build images, boot containers, curl endpoints, query databases, or read the diff to judge whether the ticket is satisfied. That is the review round's job and only the review round's job. An orchestrator that has formed its own view of whether the work is done has already broken the loop: it can no longer brief a reviewer without contaminating it, and it will start grading the reviewer's verdict against its own.

## Per loop

Steps 1 and 2 are serial. Steps 3 to 5 run per ticket, in parallel, and each ticket loops through them at its own pace. Steps 6 onward are serial again.

1. **Plan the wave — one sub-agent.** Dispatch a fresh planner over the **whole** frontier, not the first three tickets. It returns up to three tickets it judges safe to work beside each other, with one brief per ticket, and a written note of any shared contract it fixed and why it believes the tickets are independent. Independence is never inferred from `blocked_by` alone — `docs/agents/issue-tracker.md` names two couplings that look blocking and are not, and one that is easy to miss and does block. The planner may return **fewer** tickets than the cap, including one. It may never return more. Empty frontier → go straight to the final review.

2. **Set up a worktree per ticket.** Claim each ticket, then for each: `git worktree add -b` a branch off the current `HEAD`, copy in the gitignored files the tree needs (`.env`), and run `pnpm install --frozen-lockfile` inside it. Never copy or symlink `node_modules` — pnpm's store makes the install nearly free and a shared `node_modules` resolves workspace links back into the wrong tree. Export one `NX_CACHE_DIRECTORY` outside every worktree so the wave's gates share a cache; the keys are content hashes, so sharing is safe. Reserve anything that would silently collide across the wave and state it in the brief — the next free `docs/adr/NNNN-` number for each ticket that will write one. A ticket that already has a worktree from an earlier run reuses it; it holds work the earlier run left behind.

3. **Work round — one sub-agent per ticket.** Dispatch a fresh work sub-agent **in that ticket's worktree** that invokes **`/implement <ticket>`** — that skill owns the how (test-first at pre-agreed seams, typecheck cadence, its own review pass, committing to the worktree's branch). Brief it with the planner's brief, the ticket's comment history, the state of that worktree, and (on later rounds) the previous review round's findings to fix. It returns its branch name and a summary of the change.

4. **Review round — one sub-agent per ticket.** In the **same worktree**, dispatch the two-axis `/code-review` flow (Standards + Spec sub-agents, the ticket as spec, the round's commits as subject) as an independent check with fresh eyes. **The reviewer is independent of the orchestrator.** Its brief carries the ticket, the commits under review, and — on later rounds — the previous review round's findings. Nothing else. Never hand it the orchestrator's conclusions, verification results, or anything to "treat as established, do not redo": a reviewer told what to think confirms instead of reviewing, and the round is wasted. It verifies every acceptance criterion itself, by running it. The verdict is binary: **pass** (no confirmed findings) or **fail** (findings listed).

5. **Fail → another round.** Findings go back around for that ticket alone: a fresh work round fixes them, a fresh review round re-reviews, same worktree. Rounds repeat up to **10 tries** per ticket — a failed review is the start of the next round, not an exit. Tickets in a wave do not wait for each other; one may be on its third round while another is on its first.

6. **Join, then merge — one sub-agent.** When every ticket in the wave has either passed review or spent its tries, dispatch a merger. It merges each passing branch into `main` **one at a time**, running the full gate after each merge. A red gate names its own culprit, because the merge before it was green — and **the merger fixes it**. It does not back a merge out.

7. **Close what landed.** For each branch the merger landed green, close the ticket with a comment naming its commits and what shipped.

8. **Out of tries.** For a ticket that spent its tries: comment a failure log — what was tried, the exact failing output, and a concrete hypothesis for the next attempt — then unclaim (remove the assignee). Leave its worktree and branch exactly as they stand; a later wave inherits the work and the log. That ticket's loop share is spent.

9. **`ready-for-human`** — reserved for a ticket that genuinely needs a human: a product decision, missing credentials or access, a spec that contradicts itself. Comment the specific question a human must answer, swap the label, unassign. Difficulty is never the trigger — hard is what the rounds are for.

## After the last loop

Once the run is out of loops or the frontier is empty — after every wave and every round, and never once per wave:

1. **Final review.** One `/code-review` over everything the run merged. This is the only check that can see two tickets breaking each other; a reviewer scoped to one ticket in one worktree structurally cannot. Its findings become **one new ticket**, `ready-for-agent`, carrying the findings and the exact failing output. They never reopen a closed ticket.

2. **A filed ticket re-opens the loop.** If the final review filed a ticket and the run has loops left, the run is not over: that ticket is the new frontier, and the run goes back to **Per loop** for another wave. When that wave is done, the final review runs again — over everything the run has merged, including the fix. Repeat until a final review passes or the budget is spent. A ticket filed with no loops left is simply left for the next run.

3. **Clean up worktrees** — only if the last final review passed and started nothing further, and then only the worktrees of **closed** tickets. An open ticket keeps its worktree: it holds unmerged work the next run inherits.

## Report

End the run with a status report in **exactly** the format below — no sections added, renamed, or dropped (write `None.` under an empty one). Print it to screen **and** write the identical markdown to `.reports/work-backlog-<YYYY-MM-DD-HHMM>.md` (the directory is gitignored; create it if absent). This is the last step of the run.

`## For the human` carries the final review's outcome — including the number of the ticket its findings were filed as — and every worktree still on disk, since an open ticket's worktree holds work nothing else records.

```markdown
# work-backlog run — <YYYY-MM-DD HH:MM>

Loops: <used>/<budget> · Shipped: <n> · Handed forward: <n> · ready-for-human: <n>

## Shipped

- #<ticket> — <title> — `<sha>`[, `<sha>`…] — <one sentence on what was built>

## Not landed

- #<ticket> — <title> — <handed forward after N tries | ready-for-human> — <next step per the failure log / the question asked>

## For the human

- <the final review's verdict, each ready-for-human question, worktrees left on disk, unpushed commits awaiting push, and anything noticed that needs an owner's decision — one bullet each>

## Frontier

- #<ticket> — <title> [— blocked by #<n>…]
```

Leave pushing, and the parent spec/map issues, to the human.

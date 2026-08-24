---
name: work-backlog
description: Clear the ready-for-agent frontier as a Ralph loop — each loop works a wave of up to three independent tickets in parallel, driving each toward a green, merged, closed state (default 10 loops, override with an argument).
disable-model-invocation: true
context: fork
agent: backlog-orchestrator
---

# Work Backlog

Clear the **frontier** — open `ready-for-agent` issues with no open blockers and
no assignee — as a Ralph loop. Frontier query, claiming and blocking-edge
mechanics live in `docs/agents/issue-tracker.md`, and the planner owns all of
them.

## Terms

**Run** — one invocation. N **loops**; N is the argument, else 10.
**Loop** — one **wave**.
**Wave** — up to 3 tickets worked in parallel, one **worktree** each. The wave
**joins** — every ticket finishes its rounds — before anything merges.
**Round** — one try at one ticket in its worktree: a work round, then a review
round. A failed review starts another round, up to 5.

A wave contains tickets. A ticket contains rounds. Tickets run in parallel;
rounds never do.

A worktree belongs to a **ticket**, not to an agent. Every agent working that
ticket uses the same one. A ticket handed forward keeps its worktree, so the
next run inherits the work instead of restarting it.

## Roles

You are the orchestrator. You start agents and pass what one returns to the
next. Every other role is a fresh sub-agent with its own definition in
`.claude/agents/`: `backlog-planner`, `backlog-worker`, `backlog-reviewer`,
`backlog-merger`, `backlog-final-review`.

Your limits are enforced by hooks, not by this document. Denials are answers,
not obstacles. When one fires, dispatch a sub-agent.

Name every dispatch: `worker-<ticket>-r<round>`, `reviewer-<ticket>-r<round>`,
`planner-w<n>`, `merger-w<n>`, `final-review-<n>`. One live agent per ticket is
enforced through these names.

## Per loop

Steps 1 and 2 are serial. Steps 3 to 5 run per ticket in parallel, each at its
own pace. Steps 6 on are serial again.

1. **Plan the wave** — dispatch `backlog-planner`. It returns up to three
   tickets and the branch name for each. `WAVE: 0` means the frontier is empty;
   go straight to the final review.

2. **Set up a worktree per ticket.** Claim each ticket, then for each:
   `git worktree add -b <branch>` off the current `HEAD` into
   `../rv-checklist-wt/wt-<ticket>`, copy `.env` in, and run
   `pnpm install --frozen-lockfile` inside it. Never copy or symlink
   `node_modules` — pnpm's store makes the install nearly free, and a shared
   `node_modules` resolves workspace links back into the wrong tree. Export one
   `NX_CACHE_DIRECTORY` outside every worktree so the wave's gates share a
   cache; the keys are content hashes, so sharing is safe. A ticket that already
   has a worktree reuses it — it holds work an earlier run left behind.

3. **Work round** — dispatch `backlog-worker` in that ticket's worktree, with
   the planner's brief and the worktree's state. On a later round, add the
   previous review's findings.

4. **Review round** — dispatch `backlog-reviewer` in the same worktree, with the
   ticket and this round's commits. Nothing else. Never hand it your own
   conclusions or anything to treat as established.

5. **`VERDICT: fail` → another round** for that ticket alone, same worktree, up
   to 5. Tickets do not wait for each other.

6. **Join, then merge** — when every ticket in the wave has passed, spent its
   rounds, or come back `needs-human`, dispatch `backlog-merger` with the
   passing branches.

7. **Close what landed.** For each branch the merger reports merged, close the
   ticket with a comment naming its commits.

8. **Out of rounds.** Comment the failure log the last review returned, then
   unassign. Leave the worktree and branch standing.

9. **`VERDICT: needs-human`** — post the agent's question, swap the label to
   `ready-for-human`, unassign. Difficulty is never the trigger; that is what
   rounds are for.

## Silence

An agent that has not reported is not an agent that has died. Send it `status?`.

A replacement dispatch is refused until the agent has made no tool call for
fifteen minutes, and after that it is permitted — the hook decides, you do not.
Three replacements in one round means the ticket is not progressing: hand it
forward at step 8.

## After the last loop

1. **Final review** — dispatch `backlog-final-review` over everything the run
   merged. If it never reports, the run ends saying so.

2. **A filed ticket re-opens the loop.** If it filed a ticket and loops remain,
   that ticket is the new frontier: go back to **Per loop**. The final review
   runs again afterwards, over everything merged including the fix. Repeat until
   a final review passes or the budget is spent. A ticket filed with no loops
   left is left for the next run.

3. **Clean up worktrees** — only if the last final review passed and started
   nothing further. Dispatch `backlog-merger` as `merger-cleanup` with the list
   of **closed** tickets; it removes those worktrees and no others. An open
   ticket keeps its worktree.

## Report

End the run with this report, in exactly this shape — no sections added,
renamed or dropped. Write `None.` under an empty one. Print it and write the
identical markdown to `.reports/work-backlog-<YYYY-MM-DD-HHMM>.md`.

`## Needs you` carries only items with an owner: a `ready-for-human` question,
a worktree holding unmerged work, the ticket the final review filed, unpushed
commits. If you took any action a hook did not deny but this skill does not
list, name it here with the commits or tickets affected.

```markdown
# work-backlog run — <YYYY-MM-DD HH:MM>

Loops: <used>/<budget> · Shipped: <n> · Handed forward: <n> · ready-for-human: <n>

## Shipped

- #<ticket> — <title> — `<sha>`[, `<sha>`…] — <one sentence on what was built>

## Not landed

- #<ticket> — <title> — <handed forward after N rounds | ready-for-human> — <next step>

## Needs you

- <one bullet each>
```

Leave pushing, and the parent spec and map issues, to the human.

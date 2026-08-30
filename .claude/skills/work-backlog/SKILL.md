---
name: work-backlog
description: Clears the ready-for-agent frontier with a repeated loop. Each loop works a wave of three independent tickets or fewer at the same time, and drives each ticket to a merged and closed state. The default is 10 loops. An argument sets a different number.
disable-model-invocation: true
context: fork
agent: backlog-orchestrator
---

# Work Backlog

The **frontier** is the set of open `ready-for-agent` issues that have no open
blocker and no assignee. This skill clears the frontier with a repeated loop.

`docs/agents/issue-tracker.md` gives the frontier query, the claim commands, and
the blocking-edge commands. The planner controls all of them.

## Terms

**Run**: one start of this skill. A run does N loops. N is the argument. If there
is no argument, N is 10.

**Loop**: one wave.

**Wave**: three tickets or fewer, worked at the same time. Each ticket has one
worktree. All the tickets of the wave must finish their rounds before any merge
starts. This is the **join**.

**Round**: one try at one ticket in its worktree. A round has a work part and
then a review part. If the review fails, a new round starts. A ticket can have 5
rounds.

A wave contains tickets. A ticket contains rounds. The tickets of a wave run at
the same time. The rounds of a ticket never run at the same time.

A worktree belongs to a **ticket**. It does not belong to an agent. Each agent
that works that ticket uses the same worktree. A ticket that goes to the next run
keeps its worktree. Thus the next run continues the work and does not start
again.

## Roles

You are the orchestrator. You start agents. You pass the result of one agent to
the next agent.

Each other role is a new sub-agent. `.claude/agents/` holds the definition of
each one: `backlog-planner`, `backlog-worker`, `backlog-reviewer`,
`backlog-merger`, and `backlog-final-review`.

Hooks apply your limits. This document does not apply them. If a hook refuses a
tool call, that refusal is the answer. Do not look for a different method.
Dispatch a sub-agent.

Give a name to each dispatch: `worker-<ticket>-r<round>`,
`reviewer-<ticket>-r<round>`, `planner-w<n>`, `merger-w<n>`, and
`final-review-<n>`. These names apply the rule of one live agent for each ticket.

## Steps in each loop

Do step 1 and step 2 in sequence. Do steps 3 to 5 for each ticket at the same
time, and let each ticket move at its own speed. Do step 6 and the steps after it
in sequence.

1. **Plan the wave.** Dispatch `backlog-planner`. It returns three tickets or
   fewer, and the branch name for each ticket. A result of `WAVE: 0` shows that
   the frontier is empty. In that condition, go directly to the final review.

2. **Make one worktree for each ticket.** Claim each ticket first. Then, for each
   ticket:

   - Run `git worktree add -b <branch>` from the current `HEAD` into
     `../rv-checklist-wt/wt-<ticket>`.
   - Copy `.env` into the worktree.
   - Run `pnpm install --frozen-lockfile` in the worktree.

   Do not copy `node_modules` and do not make a symbolic link to it. The pnpm
   store makes the install very fast. Also, a shared `node_modules` directory
   resolves the workspace links into the incorrect tree.

   Export one `NX_CACHE_DIRECTORY` at a location outside all the worktrees. The
   gates of the wave then share one cache. The cache keys are content hashes, so
   this is safe.

   If a ticket already has a worktree, use that worktree. It holds work from an
   earlier run.

3. **Work round.** Dispatch `backlog-worker` in the worktree of the ticket. Give
   it the brief from the planner and the state of the worktree. On a round after
   the first round, also give it the findings of the previous review.

4. **Review round.** Dispatch `backlog-reviewer` in the same worktree. Give it
   the ticket and the commits of this round. Give it nothing more. Never give it
   your own conclusions. Never tell it to accept a fact.

5. **A result of `VERDICT: fail` starts a new round** for that ticket only, in
   the same worktree. A ticket can have 5 rounds. The tickets do not wait for
   each other.

6. **Join the wave, then merge.** Each ticket in the wave must pass, use all of
   its rounds, or return `needs-human`. Then dispatch `backlog-merger` with the
   branches that passed.

7. **Close each merged ticket.** The merger reports the branches that it merged.
   Close the ticket of each one with a comment that names its commits.

8. **A ticket with no rounds left.** Add the failure log from the last review as
   a comment. Then remove the assignee. Keep the worktree and the branch.

9. **A result of `VERDICT: needs-human`.** Add the question from the agent as a
   comment. Change the label to `ready-for-human`. Remove the assignee.
   Difficulty is never a reason for this result. The rounds correct difficult
   work.

## Silence

An agent that does not report is not always a dead agent. Send it `status?`.

The hook refuses a replacement dispatch until the agent makes no tool call for
fifteen minutes. After that time the hook permits the replacement. The hook makes
this decision. You do not make it.

Three replacements in one round show that the ticket does not advance. Send that
ticket to the next run with step 8.

## After the last loop

1. **Final review.** Dispatch `backlog-final-review` over all the work that the
   run merged. If it does not report, end the run and report that fact.

2. **A new ticket starts the loop again.** The final review can record a ticket.
   If loops remain, that ticket becomes the new frontier. Return to **Steps in
   each loop**. The final review then runs again over all the merged work,
   including the correction. Continue until a final review passes, or until no
   loops remain. If the final review records a ticket and no loops remain, leave
   that ticket for the next run.

3. **Remove the worktrees.** Do this step only if the last final review passed
   and started no more work. Dispatch `backlog-merger` as `merger-cleanup` with
   the list of **closed** tickets. It removes the worktrees of those tickets and
   no other worktree. A ticket that is open keeps its worktree.

## Report

End the run with the report below. Use this structure exactly. Do not add a
section. Do not rename a section. Do not remove a section. If a section has no
items, write `None.` in it.

Print the report. Also write the same Markdown to
`.reports/work-backlog-<YYYY-MM-DD-HHMM>.md`.

The `## Needs you` section holds only the items that a person must do. These are
a `ready-for-human` question, a worktree that holds work that no person merged,
the ticket that the final review recorded, and commits that no person pushed.

You can do an action that a hook permits but that this skill does not list. If
you do such an action, name it in this section with the commits or the tickets
that it changed.

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

Do not push the commits. Do not change the parent spec issue and do not change
the map issue. A person does these three tasks.

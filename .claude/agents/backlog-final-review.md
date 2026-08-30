---
name: backlog-final-review
description: Reviews all the work that a run merged, as one body of work, and records its findings as one new ticket.
---

You review all the work that the run merged into `main`. Review that work as one
change.

You are the only check that can find two tickets that break each other. A
reviewer that sees one ticket in one worktree cannot find this class of fault.
Thus you must look for it. Examples are:

- Two versions of a shared contract that do not agree.
- The same logic in two locations.
- A migration that depends on a sequence.
- An interface that one ticket made larger and a second ticket made smaller.

Run the gate from the root of the repository:

```
npx nx run-many -t typecheck lint test
```

If you find a fault, record it as **one new ticket** with the `ready-for-agent`
label. Put the findings and the exact failure output in the ticket. Do not open a
closed ticket again. The findings of a review have a small scope, so one ticket
holds them all.

Return only this:

```
VERDICT: pass | fail
FILED: <ticket number, or "none">
NOTE: <one line: what you found, or "clean">
```

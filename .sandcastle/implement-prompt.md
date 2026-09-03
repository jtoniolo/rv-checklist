# TASK

Fix issue {{TASK_ID}}: {{ISSUE_TITLE}}

Read the issue with `gh issue view {{TASK_ID}} --comments`. If the issue has a
parent PRD, read the PRD too.

Work only on this issue.

Work on branch {{BRANCH}}. Make commits and run the tests.

# CLAIM THE ISSUE

Before you write code, claim the issue:

`gh issue edit {{TASK_ID}} --add-label in-progress`

The `in-progress` label means that an autonomous agent works on the issue. The
merge step removes the label.

# CONTEXT

These are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

Read `CLAUDE.md` for the rules of this repository. Read `CONTEXT.md` and the
files in `docs/adr/` for the domain.

# EXPLORATION

Explore the repository. Collect the information that you need to do the task.

Give extra attention to the test files that cover the relevant code.

# EXECUTION

If the task permits it, use red-green-refactor.

1. RED: write one test.
2. GREEN: write the code that makes the test pass.
3. REPEAT until the task is complete.
4. REFACTOR the code.

# FEEDBACK LOOPS

This repository is a pnpm workspace with Nx. Before you commit, run these
commands and make them pass:

- `pnpm typecheck`
- `pnpm test`
- `pnpm lint`

# COMMIT

Make a git commit. The commit message must have:

1. The prefix `RALPH:`.
2. The task that you completed and the PRD reference.
3. The decisions that you made.
4. The files that you changed.
5. The blockers or the notes for the next iteration.

Keep the message short.

# THE ISSUE

If the task is not complete, add a comment to the issue. Write what you did.

Do not close the issue. The merge step closes it.

When the task is complete, write <promise>COMPLETE</promise>.

# FINAL RULES

WORK ON ONE TASK ONLY.

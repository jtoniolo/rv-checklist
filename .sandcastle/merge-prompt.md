# TASK

Merge these branches into the current branch:

{{BRANCHES}}

For each branch:

1. Run `git merge <branch> --no-edit`.
2. If the merge has conflicts, read both sides and choose the correct
   resolution.
3. After you resolve the conflicts, run `pnpm typecheck`, `pnpm test`, and
   `pnpm lint`. All three must pass.
4. If a command fails, correct the problem before you go to the next branch.

When all branches are merged, make one commit that summarises the merge.

# CLOSE THE ISSUES

For each branch that you merged, close its issue with these two commands:

`gh issue edit <ID> --remove-label in-progress`

`gh issue close <ID> --comment "Completed by Sandcastle."`

The `in-progress` label means that an agent still works on the issue. Remove
the label, so that the triage state stays correct.

If you could not merge a branch, do not close its issue and do not remove its
`in-progress` label. Add a comment to the issue instead. Write why the merge
failed.

These are the issues:

{{ISSUES}}

When you merged everything that you can, write <promise>COMPLETE</promise>.

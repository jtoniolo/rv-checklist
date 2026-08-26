# TASK

You are the {{ROLE}} for Task #{{TASK_ID}} on branch `{{BRANCH}}`.

{{SALVAGE_NOTE}}

## Worktree — do this FIRST

The implementer's work is on branch `{{BRANCH}}` in the worktree `{{WORKTREE_PATH}}`. You MUST work there. Do NOT work in the main checkout, and do NOT create a new branch.

```
git worktree prune
ls -d {{WORKTREE_PATH}} 2>/dev/null && echo "WORKTREE EXISTS"
```

If the worktree exists, use it as it is. If it does not, re-attach one to the existing branch — do NOT pass `-b` or `-B`:

```
git worktree add {{WORKTREE_PATH}} {{BRANCH}}
```

Then change into it:

```
cd {{WORKTREE_PATH}}
```

Confirm before continuing. This MUST print `{{BRANCH}}`:

```
git rev-parse --abbrev-ref HEAD
```

If it prints anything else, STOP and correct the worktree. Any commit you make from the wrong branch will not be merged. Every command for the rest of this review runs inside `{{WORKTREE_PATH}}`.

## Branch context

Review the diff against the base branch:

```
git diff {{BASE_BRANCH}}...{{BRANCH}}
```

Review the commits on this branch:

```
git log {{BASE_BRANCH}}..{{BRANCH}} --oneline
```

## Code quality

There are NO pre-existing test failures or lint errors. If tests or lint fail on this branch, the failure MUST be fixed.

## Review checklist

1. **Understand the change**: Read the diff and commits to understand the intent.

2. **Check correctness**:
   - Does the implementation match the Task's intent? Are edge cases handled?
   - Are new or changed behaviours covered by tests?
   - Are there unsafe casts, `any` types, or unchecked assumptions?
   - Does the change introduce injection vulnerabilities, credential leaks, or other security issues?

3. **Improve clarity**:
   - Reduce unnecessary complexity and nesting
   - Eliminate redundant code and abstractions
   - Improve readability through clear variable and function names
   - Consolidate related logic
   - Remove unnecessary comments that describe obvious code
   - Avoid nested ternary operators — prefer switch statements or if/else chains
   - Choose clarity over brevity — explicit code is often better than overly compact code

4. **Maintain balance** — do NOT over-simplify in ways that:
   - Reduce code clarity or maintainability
   - Create overly clever solutions that are hard to understand
   - Combine too many concerns into single functions or components
   - Remove helpful abstractions that improve code organization
   - Make the code harder to debug or extend

5. **Preserve functionality**: NEVER change what the code does — only how it does it. All original features, outputs, and behaviours MUST remain intact.

## Execution

{{TEST_STEP}}{{LINT_STEP}}If you find improvements to make:

1. Make the changes directly on this branch.
2. Run tests and lint. Fix every failure.
3. Commit describing the refinements with the `{{COMMIT_PREFIX}}` prefix.

If the code is already clean and well-structured, do nothing.

## Output

Return a JSON object matching this schema:

```json
{
  "refined": true,
  "summary": "One-line summary of improvements made, or 'no changes needed'"
}
```

Fields:

- `refined` (boolean, required): Whether any refinements were committed on the branch.
- `summary` (string): One-line summary of improvements made, or "no changes needed".

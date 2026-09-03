# ISSUES

These are the open issues that carry the `ready-for-agent` label:

<issues-json>

!`gh issue list --state open --label ready-for-agent --limit 100 --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`

</issues-json>

The `ready-for-agent` label means that a maintainer triaged the issue and that
an agent can start it. The list above holds no other issue. Do not add an issue
that the list does not hold.

# TASK

Read each issue. Build a dependency graph. For each issue, decide if another
open issue blocks it.

Use the rule of this repository. The rule is in `docs/agents/issue-tracker.md`,
in the section "What counts as blocked". Read that file before you decide. The
rule is:

> A ticket is **blocked** when it cannot meet **its own acceptance criteria**
> before another open ticket is merged.

Apply the test to the acceptance criteria of the issue. If a criterion names an
artifact that an open issue must still produce, add a blocking edge.

These two conditions look like blocking, but they are **not** blocking:

- A shared contract that is already on `main`.
- Two issues that change the same files. This condition costs one rebase.

This condition **is** blocking. A shared contract is not yet decided, and
another open issue will decide it.

This repository also records blocking with the native issue dependencies of
GitHub. To read the blockers of issue `<n>`, run:

`gh api repos/{owner}/{repo}/issues/<n> --jq .issue_dependencies_summary`

If `blocked_by` is more than 0, the issue has an open blocker. Trust that
record. Add your own edges on top of it.

An issue is **unblocked** when it has zero blocking dependencies on other open
issues.

For each unblocked issue, make a branch name in the exact format
`sandcastle/issue-{id}`. Do not add a slug and do not add a suffix. The name
must be deterministic, so that a second plan for the same issue gives the same
branch name and keeps the earlier work.

# OUTPUT

Write your plan as a JSON object inside `<plan>` tags:

<plan>
{"issues": [{"id": "42", "title": "Fix auth bug", "branch": "sandcastle/issue-42"}]}
</plan>

Include only unblocked issues. If every issue is blocked, include the one
candidate with the fewest or the weakest dependencies.

Always write the `<plan>` tags, also when there is no work. If there is no
issue to work on, write `<plan>{"issues": []}</plan>`. The run then exits.

# Issue tracker: GitHub

The issues and the PRDs of this repository are GitHub issues. Use the `gh` CLI
for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. If the body
  has more than one line, use a heredoc.
- **Read an issue**: `gh issue view <number> --comments`. Filter the comments
  with `jq`. Also get the labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`.
  Add the necessary `--label` and `--state` filters.
- **Add a comment to an issue**: `gh issue comment <number> --body "..."`
- **Add or remove a label**: `gh issue edit <number> --add-label "..."` or
  `gh issue edit <number> --remove-label "..."`
- **Close an issue**: `gh issue close <number> --comment "..."`

Get the name of the repository from `git remote -v`. If you run `gh` in a clone,
`gh` finds the name without help.

## Pull requests for triage

**Are pull requests a request channel? No.** Change this answer to `yes` if this
repository accepts external pull requests as feature requests. The `/triage`
skill reads this value.

If the answer is `yes`, pull requests use the same labels and the same states as
issues. Use the equivalent `gh pr` commands:

- **Read a pull request**: `gh pr view <number> --comments`. To see the changes,
  run `gh pr diff <number>`.
- **List external pull requests for triage**:
  `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`.
  Then keep only the items with an `authorAssociation` of `CONTRIBUTOR`,
  `FIRST_TIME_CONTRIBUTOR`, or `NONE`. Remove the items with `OWNER`, `MEMBER`,
  or `COLLABORATOR`.
- **Comment, label, or close**: `gh pr comment`, `gh pr edit --add-label`,
  `gh pr edit --remove-label`, and `gh pr close`.

GitHub gives issues and pull requests numbers from one sequence. Thus a number
such as `#42` can be an issue or a pull request. To find which one it is, run
`gh pr view 42` first. If that command fails, run `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## What counts as blocked

The `/wayfinder` skill and the `/work-backlog` skill both read this section.
Each skill calculates a frontier. A frontier is the set of tickets that an agent
can start now.

> A ticket is **blocked** when it cannot meet **its own acceptance criteria**
> before another open ticket is merged.

The test is mechanical. Read the acceptance criteria of the ticket. If a
criterion names an artifact that an open ticket must still produce, add a
blocking edge. A criterion that only renders, lints, or type-checks an artifact
that the same ticket creates is self-contained. Such a criterion does not block.

Two conditions look like blocking, but they are **not** blocking:

- **A shared contract that is already on `main`.** Two tickets must agree about
  an item such as a port, a set of environment variables, or the shape of a
  route. That item is already decided and committed. Do not add an edge. Instead
  put a link to the source of truth in the body of the ticket. The implementer
  can then read the contract and does not invent a second version.
- **Two tickets that change the same files.** This condition costs the
  implementer one rebase. It does not make the result incorrect.

One condition **is** blocking, and it is easy to miss. A shared contract is not
yet decided, and another open ticket will decide it. The implementer must invent
the contract and then do the work a second time. The edge is real, although
nothing stops the implementer from a start.

Here is an example. The three tickets are the API image (#45), the Helm chart
(#46), and the CD workflow (#47).

The criteria of the chart are a `helm lint` run and a `helm template` render.
These criteria are self-contained. The environment contract that the chart needs
is already on `main`, in `apps/api/src/app/config/env.ts`. Thus the image does
**not** block the chart.

The criteria of the CD workflow name the published image and the packaged chart.
Thus the image and the chart both block the CD workflow.

## Wayfinding operations

The `/wayfinder` skill uses these operations. The **map** is one issue. Its
**child** issues are the tickets.

- **Map**: one issue with the `wayfinder:map` label. Its body holds the Notes,
  the Decisions-so-far, and the Fog. Create it with
  `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue that is a GitHub sub-issue of the map. Use `gh api`
  on the sub-issues endpoint. If the repository does not have sub-issues, add
  the child to a task list in the body of the map. Also put `Part of #<map>` at
  the top of the body of the child. The label is `wayfinder:<type>`, where
  `<type>` is `research`, `prototype`, `grilling`, or `task`. When a developer
  claims the ticket, assign the ticket to that developer.
- **Blocking**: use the **native issue dependencies** of GitHub. This is the
  correct record, and the GitHub interface shows it. The section [What counts as
  blocked](#what-counts-as-blocked) above tells you when to add an edge. This
  item gives only the commands. Add an edge with
  `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
  The `<blocker-db-id>` value is the numeric **database id** of the blocker. Get
  it with `gh api repos/<owner>/<repo>/issues/<n> --jq .id`. Do **not** use the
  `#number` and do **not** use the `node_id`. GitHub then reports
  `issue_dependencies_summary.blocked_by`. That field counts open blockers only,
  so it is the live gate. If dependencies are not available, put a
  `Blocked by: #<n>, #<n>` line at the top of the body of the child. A ticket
  becomes unblocked when all of its blockers are closed.
- **Frontier query**: list the open children of the map with
  `gh issue list --state open`, limited to the sub-issues or the task list of
  the map. Remove each ticket that has an open blocker. A ticket has an open
  blocker when `issue_dependencies_summary.blocked_by` is more than 0, or when
  the `Blocked by` line names an open issue. Also remove each ticket that has an
  assignee. From the tickets that remain, take the first one in map order.
- **Claim**: `gh issue edit <n> --add-assignee @me`. This is the first write
  operation of the session.
- **Resolve**: run `gh issue comment <n> --body "<answer>"`. Then run
  `gh issue close <n>`. Then add a context pointer to the Decisions-so-far of
  the map. The pointer is a gist and a link.

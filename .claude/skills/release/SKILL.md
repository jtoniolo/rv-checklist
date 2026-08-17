---
name: release
description: Cut a release — bump the version everywhere, commit, tag, push, publish notes, and hand the CD dispatch back to you.
disable-model-invocation: true
---

# Release

A release is a **git tag**. CD reads the version from the tag it is dispatched against and refuses to publish when that tag disagrees with `charts/api/Chart.yaml` — see the drift guard in `.github/workflows/cd.yml`.

Cutting that tag by hand is a sequence that is easy to do half of: bump without the tag, tag without the bump. The guard only catches the mismatch after the fact, once CD has already been dispatched.

This skill runs the sequence whole, or fails **preflight** and touches nothing.

Invoked as `/release patch`, `/release minor`, `/release major`, or `/release 1.4.0`. No argument means `patch`.

## 1. Resolve the target version

`charts/api/Chart.yaml` is the **single source of truth** for the current version. No `package.json` is consulted — they are written, never read, and one that has fallen behind is simply overwritten by the bump.

```bash
awk '/^version:/ {print $2}' charts/api/Chart.yaml | tr -d '"'
```

- `patch` (or no argument) — bump Z
- `minor` — bump Y, Z to `0`
- `major` — bump X, Y and Z to `0`
- `X.Y.Z` — that version verbatim, if it matches `^[0-9]+\.[0-9]+\.[0-9]+$` and does not move backwards from the current one

Anything else aborts: a `v` prefix, a fourth part, a pre-release suffix, a version lower than the current one.

A target **equal** to the current version is legal and is how you recover from a bump that landed without its tag. Every other path forward is a real bump.

Print the current version and the target before going further.

## 2. Clear preflight

Fetch first, so the checks see the remote as it actually is:

```bash
git fetch origin main --tags
```

Then, with `$V` as the target version, every check below — **all of them, before any file is edited**:

| Must hold | How to check |
| --- | --- |
| On `main` | `git rev-parse --abbrev-ref HEAD` is `main` |
| Working tree clean | `git status --porcelain` prints nothing |
| In sync with the remote | `git rev-parse HEAD` equals `git rev-parse origin/main` |
| Chart lints | `helm lint charts/api` exits `0` |
| CI green on `HEAD` | `gh run list --workflow ci.yml --commit "$(git rev-parse HEAD)" --json status,conclusion,createdAt --limit 10` — the newest run is `completed` / `success`. No run at all is an abort: nothing has proven this commit. |
| Tag free locally | `git rev-parse -q --verify "refs/tags/v$V"` fails |
| Tag free on the remote | `git ls-remote --tags origin "refs/tags/v$V"` prints nothing |

Releases are immutable: once a tag is **pushed** it is never moved, deleted, or reused.

The first failure ends the run. Say which check failed, the value it saw, and what the human has to do about it. The working tree is untouched at this point, so there is no partial bump and no orphan tag to clean up.

## 3. Bump the version

Five values across four files, all set to the same `X.Y.Z`, so no release ever needs a judgment call about which package moved:

- `charts/api/Chart.yaml` — `version: X.Y.Z` and `appVersion: "X.Y.Z"` (keep `appVersion` quoted)
- `package.json` — `"version": "X.Y.Z"`
- `apps/api/package.json` — same
- `apps/web/package.json` — same

Then account for **all five**, because only the chart's two are guarded downstream — a missed `package.json` would sail through CD unnoticed:

```bash
awk '/^version:/ {print $2}' charts/api/Chart.yaml | tr -d '"'
awk '/^appVersion:/ {print $2}' charts/api/Chart.yaml | tr -d '"'
grep -m1 '"version"' package.json apps/api/package.json apps/web/package.json
```

Every one must read `X.Y.Z`. The first two lines are CD's own extraction, copied from its drift guard — passing them here is the guard passing there, before the tag exists rather than after CD is dispatched.

The chart was linted in preflight, but has been edited since, so lint it again:

```bash
helm lint charts/api
```

A failure here is still recoverable: nothing is committed, and `git restore charts/api/Chart.yaml package.json apps/api/package.json apps/web/package.json` returns the tree to the state preflight approved.

## 4. Commit, tag, push

```bash
git commit charts/api/Chart.yaml package.json apps/api/package.json apps/web/package.json -m "Release vX.Y.Z"
git tag -a "vX.Y.Z" -m "vX.Y.Z"
git push origin main
git push origin "vX.Y.Z"
```

The commit goes before the tag and the commit's push before the tag's, so the tag never points at something the remote doesn't have.

**Recovery case.** If `git status --porcelain` is empty after step 3, every value already read `X.Y.Z` and there is nothing to commit — skip the commit and tag `HEAD`, which is the commit that already carries the bump. That is the whole point of allowing an equal target. Decide by that command, not by assumption; a chart that moved while a `package.json` lagged leaves real changes and takes the ordinary path.

**If a push is rejected** — someone landed on `main` between the fetch and here — stop. Nothing has been published, so the run is recoverable by starting over: delete the local tag (`git tag -d "vX.Y.Z"`), reset the local bump commit if one was made, and re-run `/release` from preflight against the new `main`. Force-pushing and moving a tag are never the answer.

## 5. Publish the notes

```bash
gh release create "vX.Y.Z" --title "vX.Y.Z" --generate-notes
```

## 6. Hand off

Dispatching CD is the human's act. Picking the tag out of that dropdown is the moment they confirm what is going out, so the run ends on the instruction — printing it is the last thing the skill does. Publishing is not the skill's to trigger: `gh workflow run cd.yml`, and any `gh api` equivalent, stay uncalled no matter how convenient it looks.

```
Release vX.Y.Z is tagged and pushed.

Publish it: Actions → CD → Run workflow → Tags → vX.Y.Z
```

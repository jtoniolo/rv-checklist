---
name: release
description: Cut a release — bump the version everywhere, commit, tag, push, publish notes, and hand the CD dispatch back to you.
disable-model-invocation: true
---

# Release

A release is a **git tag**. CD reads the version from the tag it is dispatched against and refuses to publish when that tag disagrees with `charts/api/Chart.yaml` — see the drift guard in `.github/workflows/cd.yml`.

Cutting that tag by hand is a sequence that is easy to do half of: bump without the tag, tag without the bump. The guard only catches the mismatch after the fact, once CD has already been dispatched.

This skill runs the sequence whole, or clears a **gate** first and touches nothing if it can't.

Invoked as `/release patch`, `/release minor`, `/release major`, or `/release 1.4.0`.

## 1. Resolve the target version

`charts/api/Chart.yaml` holds the current version:

```bash
awk '/^version:/ {print $2}' charts/api/Chart.yaml | tr -d '"'
```

- `patch` — bump Z
- `minor` — bump Y, Z to `0`
- `major` — bump X, Y and Z to `0`
- `X.Y.Z` — that version verbatim, if it matches `^[0-9]+\.[0-9]+\.[0-9]+$` and does not move backwards from the current one

Anything else aborts: a `v` prefix, a fourth part, a pre-release suffix, a version lower than the current one.

A target **equal** to the current version is legal and is how you recover from a bump that landed without its tag. Every other path forward is a real bump.

Print the current version and the target before going further.

## 2. Clear the gate

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

Releases are immutable — an existing tag is never moved, deleted, or reused.

The first failure ends the run. Say which check failed, the value it saw, and what the human has to do about it. The working tree is untouched at this point, so there is no partial bump and no orphan tag to clean up.

## 3. Bump the version

Five values across four files, all set to the same `X.Y.Z`, so no release ever needs a judgment call about which package moved:

- `charts/api/Chart.yaml` — `version: X.Y.Z` and `appVersion: "X.Y.Z"` (keep `appVersion` quoted)
- `package.json` — `"version": "X.Y.Z"`
- `apps/api/package.json` — same
- `apps/web/package.json` — same

Then run CD's own extraction against the edited chart:

```bash
awk '/^version:/ {print $2}' charts/api/Chart.yaml | tr -d '"'
awk '/^appVersion:/ {print $2}' charts/api/Chart.yaml | tr -d '"'
```

Both must print exactly `X.Y.Z`. This is the drift guard, run early — passing it here is the guard passing in CD.

## 4. Commit, tag, push

```bash
git commit charts/api/Chart.yaml package.json apps/api/package.json apps/web/package.json -m "Release vX.Y.Z"
git tag -a "vX.Y.Z" -m "vX.Y.Z"
git push origin main
git push origin "vX.Y.Z"
```

The commit goes before the tag and the commit's push before the tag's, so the tag never points at something the remote doesn't have.

In the recovery case, where the files already held the target, there is nothing to commit — tag `HEAD`, which is the commit that already carries the bump.

## 5. Publish the notes

```bash
gh release create "vX.Y.Z" --title "vX.Y.Z" --generate-notes
```

## 6. Hand off

Dispatching CD is the human's act. Picking the tag out of that dropdown is the moment they confirm what is going out, so the run ends on the instruction:

```
Release vX.Y.Z is tagged and pushed.

Publish it: Actions → CD → Run workflow → Tags → vX.Y.Z
```

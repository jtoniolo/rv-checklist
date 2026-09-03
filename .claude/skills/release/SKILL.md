---
name: release
description: Makes a release. Sets the version in all the files, commits, tags, pushes, publishes the notes, and then tells you to dispatch CD.
disable-model-invocation: true
---

# Release

A release is a **git tag**. CD reads the version from the tag that you dispatch
it against. If that tag does not agree with `charts/api/Chart.yaml` or
`charts/web/Chart.yaml`, CD refuses to publish. The drift guard in
`.github/workflows/cd.yml` checks both charts.

A person who makes the tag manually does a sequence of steps. It is easy to do
only a part of that sequence. You can change the version and forget the tag. You
can make the tag and forget the version. The guard finds the difference only
after you dispatch CD.

This skill does the full sequence, or it fails in **preflight** and changes
nothing.

Start this skill as `/release patch`, `/release minor`, `/release major`, or
`/release 1.4.0`. If there is no argument, the skill uses `patch`.

## 1. Calculate the target version

`charts/api/Chart.yaml` holds the **only** record of the current version. Do not
read a `package.json` file for the version. The skill writes those files and
never reads them. If a `package.json` file holds an old version, the new version
replaces it.

```bash
awk '/^version:/ {print $2}' charts/api/Chart.yaml | tr -d '"'
```

Calculate the target version from the argument:

- `patch`, or no argument: add 1 to Z.
- `minor`: add 1 to Y. Set Z to `0`.
- `major`: add 1 to X. Set Y and Z to `0`.
- `X.Y.Z`: use this version exactly. It must agree with
  `^[0-9]+\.[0-9]+\.[0-9]+$`. It must not be lower than the current version.

Stop the run for any other argument. Examples that stop the run are a `v` prefix,
a fourth part, a pre-release suffix, and a version lower than the current
version.

A target version **equal** to the current version is permitted. Use it when a
version change was committed but its tag was not. All the other permitted targets
increase the version.

Print the current version and the target version before you continue.

## 2. Pass preflight

Fetch first. The checks must see the true state of the remote:

```bash
git fetch origin main --tags
```

Then do every check in the table below. `$V` is the target version. Do **all** of
the checks **before you change a file**.

| Condition that must be true | How to check it |
| --- | --- |
| The branch is `main` | `git rev-parse --abbrev-ref HEAD` prints `main` |
| The working tree has no changes | `git status --porcelain` prints nothing |
| The branch agrees with the remote | `git rev-parse HEAD` equals `git rev-parse origin/main` |
| Both charts pass lint | `helm lint charts/api` and `helm lint charts/web` each exit with `0` |
| CI passed on `HEAD` | See the paragraph below the table |
| The tag does not exist locally | `git rev-parse -q --verify "refs/tags/v$V"` fails |
| The tag does not exist on the remote | `git ls-remote --tags origin "refs/tags/v$V"` prints nothing |

To check CI, run this command:

```bash
gh run list --workflow ci.yml --commit "$(git rev-parse HEAD)" --json status,conclusion,createdAt --limit 10
```

The newest run must have the status `completed` and the conclusion `success`. If
there is no run, stop the run. No run means that no test proved this commit.

There is one exception. The `ci.yml` workflow does not run on a commit whose
message starts with `Release v`. If `HEAD` is such a commit, this is the recovery
condition. Check the parent commit instead. Use the same command with
`git rev-parse HEAD^`. The parent must meet the same conditions.

A release does not change. After you **push** a tag, do not move that tag, do not
delete it, and do not use it again.

The first check that fails ends the run. Report the name of the check, the value
that it found, and the action that the person must do. At this point the working
tree has no changes. Thus there is no partial version change and no unnecessary
tag to remove.

## 3. Change the version

Seven values are in five files. Set all seven to the same `X.Y.Z` value. Then no
release needs a decision about which package changed.

- `charts/api/Chart.yaml`: `version: X.Y.Z` and `appVersion: "X.Y.Z"`. Keep the
  quotation marks on `appVersion`.
- `charts/web/Chart.yaml`: `version: X.Y.Z` and `appVersion: "X.Y.Z"`. Keep the
  quotation marks on `appVersion`.
- `package.json`: `"version": "X.Y.Z"`
- `apps/api/package.json`: the same value.
- `apps/web/package.json`: the same value.

Then check **all seven** values. The guard downstream checks only the four values
in the two charts. Thus CD does not find an incorrect `package.json` file.

```bash
awk '/^version:/ {print $2}' charts/api/Chart.yaml | tr -d '"'
awk '/^appVersion:/ {print $2}' charts/api/Chart.yaml | tr -d '"'
awk '/^version:/ {print $2}' charts/web/Chart.yaml | tr -d '"'
awk '/^appVersion:/ {print $2}' charts/web/Chart.yaml | tr -d '"'
grep -m1 '"version"' package.json apps/api/package.json apps/web/package.json
```

Each line must print `X.Y.Z`. The first four commands are the same commands that
the drift guard of CD uses on each chart. If they pass here, the guard passes
later. This check occurs before the tag exists, and the guard occurs after you
dispatch CD.

Preflight already checked both charts with lint. You then changed both charts.
Thus check them again:

```bash
helm lint charts/api
helm lint charts/web
```

A failure here is still recoverable. Nothing is committed. This command returns
the tree to the state that preflight approved:

```bash
git restore charts/api/Chart.yaml charts/web/Chart.yaml package.json apps/api/package.json apps/web/package.json
```

## 4. Commit, tag, and push

```bash
git commit charts/api/Chart.yaml charts/web/Chart.yaml package.json apps/api/package.json apps/web/package.json -m "Release vX.Y.Z"
git tag -a "vX.Y.Z" -m "vX.Y.Z"
git push origin main
git push origin "vX.Y.Z"
```

Make the commit before the tag. Push the commit before the tag. The tag then
always points to a commit that the remote has.

**Recovery condition.** After step 3, run `git status --porcelain`. If it prints
nothing, all seven values already held `X.Y.Z`, and there is nothing to commit. Do
not make a commit. Make the tag on `HEAD`, because `HEAD` already holds the
version change. This is the purpose of the equal target version.

Use the result of that command to make this decision. Do not assume the
condition. The chart can hold the new version while a `package.json` file holds
the old version. That state gives real changes, and the run continues on the
usual path.

**If a push fails**, a different person pushed to `main` between your fetch and
this step. Stop the run. Nothing is published, so you can recover the run with a
new start:

1. Delete the local tag: `git tag -d "vX.Y.Z"`.
2. Reset the local version commit, if you made one.
3. Start `/release` again from preflight, against the new `main`.

Never use a force push. Never move a tag.

## 5. Publish the notes

```bash
gh release create "vX.Y.Z" --title "vX.Y.Z" --generate-notes
```

## 6. Hand the release to the person

A person must dispatch CD. When that person selects the tag from the list, that
person confirms the content of the release. Thus the run ends with the
instruction below, and the skill prints it last.

The skill does not start the publish operation. Do not run
`gh workflow run cd.yml`. Do not run the equivalent `gh api` command. This rule
has no exception.

```
Release vX.Y.Z is tagged and pushed.

Publish it: Actions → CD → Run workflow → Tags → vX.Y.Z
```

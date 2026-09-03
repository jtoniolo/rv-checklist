# Coding standards

The reviewer agent loads this file during the review. The implementer does not
load it.

## Repository

- This repository is a pnpm workspace with Nx. The projects are in `apps/` and
  in `libs/`.
- The gate is `pnpm typecheck`, `pnpm test`, and `pnpm lint`. All three must
  pass.
- Read `CLAUDE.md`, `CONTEXT.md`, and the files in `docs/adr/` for the rules and
  the domain of this repository.

## Style

- Write TypeScript. Do not add a new JavaScript file.
- Do not use the `any` type. Do not use an unchecked cast.
- Prefer a named export. Use a default export only when a framework needs one.
- Prettier formats the code. Do not format by hand.
- ESLint runs with `--max-warnings=0`. A warning is an error.

## Language

- Write every Markdown file in ASD-STE100 Simplified Technical English. This
  rule covers the architecture decision records, the agent files, and the
  README.
- Write the commit message and the issue comment in the same English.

## Testing

- Jest runs the unit tests. Playwright runs the end-to-end tests in
  `apps/web-e2e`.
- Each new behaviour needs at least one test.
- Write a test name that states the expected behaviour.

## Architecture

- Keep the boundary between `apps/` and `libs/`. An app can import a library. A
  library must not import an app.
- The Nx tags control the boundary. Respect `scope:` and `type:`.
- Keep each module to one responsibility.
- Record a decision that changes the architecture as a new file in `docs/adr/`.

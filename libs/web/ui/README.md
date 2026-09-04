# @rv-checklist/web-ui

[Nx](https://nx.dev) generated this library.

## Run the unit tests

Run `nx test @rv-checklist/web-ui`. This command runs the unit tests with
[Jest](https://jestjs.io).

## The build target

`apps/web` consumes this library from source: `package.json` points `main`,
`types`, and `exports` at `src/index.ts`, and Next.js compiles the TSX. The Nx
TypeScript plugin infers a build target only for a package that points at its
output directory, so this library got no build target.

`apps/web/tsconfig.json` still keeps a TypeScript project reference to this
library, and `nx sync` maintains that reference. The reference makes the
Next.js type check read `libs/web/ui/dist/index.d.ts`. A working tree that
never built this library has no `dist`, and the type check fails with TS6305.
The container build hit this: `.dockerignore` excludes `**/dist`.

`package.json` therefore declares an explicit `build` target that runs
`tsc --build tsconfig.lib.json` and emits the declarations. It matches the
target that the plugin infers for `@rv-checklist/web-data-access`, so
`apps/web:build` reaches it through `^build`. The `typecheck` target runs after
`build` because both write `dist/tsconfig.lib.tsbuildinfo`.

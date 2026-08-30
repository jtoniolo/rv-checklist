# 9. The layout of the Nx workspace

Date: 2026-07-17

## Status

Accepted.

This ADR builds the stack that the Notes on the map name. ADR-0001 constrains it,
because the web SSR operates on a Cloudflare Worker.

## Context

Before we make the first code, the monorepo needs a fixed shape. We must decide
three things:

- The location of the NestJS API and the Next.js web application.
- The location of the shared domain model and the shared DTOs. Both applications
  must then read one source of truth.
- The boundary rules that keep the parts separate.

The build makes a bundle of the web application for a Cloudflare Worker. Refer to
ADR-0001. Thus each module that the web application imports must be safe at the
edge. Such a module must not use an API that only Node supplies. It also must not
use decorators or `reflect-metadata`.

## Decision

- **Package manager: pnpm.** Use a single-version policy, with one `package.json`
  at the root.
- **Applications:**
  - `apps/api`: NestJS, deployed to k3s. Refer to ADR-0001.
  - `apps/web`: Next.js, built for the Cloudflare Worker with OpenNext. Refer to
    ADR-0001.
- **Libraries.** Use the usual Nx grid of a scope and a type from the first day:
  - `libs/shared/domain`: **the Zod schemas and the types that Zod infers** for
    the entities and the DTOs. This is the only source of truth for the model on
    the wire. It is neutral to the platform and safe at the edge. It depends on
    `zod` only.
  - `libs/api/data-access`: the TypeORM entities, the repositories, and the
    migrations. Node only. The API maps between these entities and the shared Zod
    DTOs.
  - `libs/web/data-access`: the typed API client, which uses `fetch`. It parses
    each response with the shared schemas.
  - `libs/web/ui`: the React components that make the display.
- **Validation.** The API uses `nestjs-zod` with the `ZodValidationPipe`. Thus
  the DTOs of the request and the response *are* the shared schemas. The web
  application uses the same schemas to validate a form.
- **Tags.** Each project carries a `scope:{shared|api|web}` tag and a
  `type:{app|domain|data-access|ui}` tag. Add `type:feature` when the first
  feature library appears.
- **Boundary rules.** Put these `depConstraints` in
  `@nx/enforce-module-boundaries`:
  - `scope:shared` can use `scope:shared` only.
  - `scope:api` can use `scope:api` and `scope:shared`.
  - `scope:web` can use `scope:web` and `scope:shared`.
  - `type:domain` can use `type:domain` only.
  - `type:data-access` can use `type:domain` and `type:data-access`.
  - `type:ui` can use `type:domain` and `type:ui`.
  - `type:app` can use each type in the scopes that its scope rule permits.

## Alternatives that we compared

- **A minimal layout, with one `libs/shared` library.** We rejected this
  alternative. It is less expensive at the start. But a later division of the
  libraries changes each import. The usual grid costs little now, and the
  boundary rules apply the layers from the first commit.
- **DTOs with class-validator**, which is the default of NestJS. We rejected this
  alternative. A class with decorators needs `reflect-metadata`, and it does not
  make a clean bundle for the web application at the edge. Thus the web
  application could share the types but not the validators. That gives two
  sources of truth for the validation.
- **npm or yarn.** We rejected these alternatives. pnpm is faster, uses less
  disk, and is the usual selection in the Nx community.

## Consequences

- Each module in `scope:shared` must stay safe at the edge. The boundary rules
  and the OpenNext build apply this rule.
- The TypeORM entities and the Zod schemas are two separate models. This is
  intentional, and the API owns the map between them. There is a small quantity
  of duplication. But the shape of the storage never becomes visible to the web
  application.
- Some libraries, such as `web/ui`, are almost empty at the start. We accept this
  cost, because we selected the usual division.

## Steps to make the workspace

1. Make the workspace at the root of the repository:
   `pnpm dlx create-nx-workspace@latest --preset=ts --pm=pnpm`. Generate it in a
   different directory and then merge it into this repository. Keep `docs/`,
   `CONTEXT.md`, and `CLAUDE.md`. Commit `pnpm-lock.yaml`.
2. Run `pnpm add -D @nx/nest @nx/next @nx/react @nx/js`.
3. Run `nx g @nx/nest:app apps/api`. Use the tags `scope:api,type:app`.
4. Run `nx g @nx/next:app apps/web`. Use the tags `scope:web,type:app`.
5. Run `nx g @nx/js:lib libs/shared/domain`. Use the tags
   `scope:shared,type:domain`.
6. Run `nx g @nx/js:lib libs/api/data-access`. Use the tags
   `scope:api,type:data-access`.
7. Run `nx g @nx/js:lib libs/web/data-access`. Use the tags
   `scope:web,type:data-access`.
8. Run `nx g @nx/react:lib libs/web/ui`. Use the tags `scope:web,type:ui`.
9. Run `pnpm add zod nestjs-zod typeorm` at the root, for the single-version
   policy.
10. Put the `depConstraints` from this ADR into the ESLint configuration at the
    root, in `@nx/enforce-module-boundaries`.
11. Configure OpenNext and Wrangler for `apps/web`. Refer to ADR-0001.

# 9. Nx workspace layout

Date: 2026-07-17

## Status

Accepted

Implements the stack named in the map's Notes; constrained by ADR-0001 (web SSR
runs on a Cloudflare Worker).

## Context

The build needs a settled monorepo shape before scaffolding: where the NestJS
API and Next.js web app live, where the shared domain model/DTOs live so both
apps read one source of truth, and which boundary rules keep the pieces from
tangling. Because the web app is bundled for a Cloudflare Worker (ADR-0001),
anything it imports must be edge-safe — no Node-only APIs, no
decorator/reflect-metadata machinery.

## Decision

- **Package manager: pnpm**, single-version policy (one root `package.json`).
- **Apps**
  - `apps/api` — NestJS, deployed to k3s (ADR-0001).
  - `apps/web` — Next.js, built for the Cloudflare Worker via OpenNext
    (ADR-0001).
- **Libs** — conventional Nx scope/type grid from day one:
  - `libs/shared/domain` — **Zod schemas + inferred types** for entities and
    DTOs. The single source of truth for the wire model. Platform-neutral and
    edge-safe; depends on nothing but `zod`.
  - `libs/api/data-access` — TypeORM entities, repositories, migrations.
    Node-only; the API maps between these and the shared Zod DTOs.
  - `libs/web/data-access` — typed API client (fetch), parsing responses with
    the shared schemas.
  - `libs/web/ui` — presentational React components.
- **Validation**: the API uses `nestjs-zod` (ZodValidationPipe) so request/
  response DTOs *are* the shared schemas; the web reuses the same schemas for
  form validation.
- **Tags** — every project carries `scope:{shared|api|web}` and
  `type:{app|domain|data-access|ui}` (`type:feature` added when feature libs
  appear).
- **Boundary rules** (`@nx/enforce-module-boundaries` depConstraints):
  - `scope:shared` → only `scope:shared`
  - `scope:api` → `scope:api`, `scope:shared`
  - `scope:web` → `scope:web`, `scope:shared`
  - `type:domain` → only `type:domain`
  - `type:data-access` → `type:domain`, `type:data-access`
  - `type:ui` → `type:domain`, `type:ui`
  - `type:app` → any type within its allowed scopes

## Alternatives considered

- **Minimal layout (single `libs/shared`)** — rejected. Cheaper to start, but
  re-slicing libs later churns every import; the conventional grid costs little
  now and the boundary rules enforce the layering from the first commit.
- **class-validator DTOs** (NestJS default) — rejected. Decorator classes need
  `reflect-metadata` and don't bundle cleanly into the edge web app, so the web
  could share types but not validators — two sources of validation truth.
- **npm / yarn** — rejected; pnpm is faster, disk-efficient, and the Nx
  community default.

## Consequences

- Everything under `scope:shared` must stay edge-safe; the boundary rules plus
  the OpenNext build keep this honest.
- TypeORM entities and Zod schemas are deliberately separate models; the API
  owns the mapping. Slight duplication, but persistence shape never leaks to
  the web.
- Empty-ish libs (`web/ui`) exist before they earn their keep — accepted cost
  of choosing the conventional split.

## Scaffolding checklist

1. Scaffold at the repo root: `pnpm dlx create-nx-workspace@latest --preset=ts
   --pm=pnpm` (generate aside, merge into this repo, keep `docs/`, `CONTEXT.md`,
   `CLAUDE.md`); commit `pnpm-lock.yaml`.
2. `pnpm add -D @nx/nest @nx/next @nx/react @nx/js`
3. `nx g @nx/nest:app apps/api` — tags `scope:api,type:app`
4. `nx g @nx/next:app apps/web` — tags `scope:web,type:app`
5. `nx g @nx/js:lib libs/shared/domain` — tags `scope:shared,type:domain`
6. `nx g @nx/js:lib libs/api/data-access` — tags `scope:api,type:data-access`
7. `nx g @nx/js:lib libs/web/data-access` — tags `scope:web,type:data-access`
8. `nx g @nx/react:lib libs/web/ui` — tags `scope:web,type:ui`
9. `pnpm add zod nestjs-zod typeorm` (root, single-version policy)
10. Wire the depConstraints above into the root ESLint config
    (`@nx/enforce-module-boundaries`).
11. OpenNext/Wrangler config for `apps/web` per ADR-0001.

# Architecture Decision Records

Durable record of the significant, resolved decisions for this project. Each ADR
captures one decision, its context, the alternatives weighed, and the
consequences. The Wayfinder map (issue #1) and its tickets are the *trail* of how
these were reached; the ADRs here are the *source of truth* a build reads.

| ADR | Decision |
|-----|----------|
| [0001](0001-deployment-and-connectivity.md) | Deployment and connectivity topology (SSR Worker, NestJS in k3s via CF Tunnel, browser→API direct) |
| [0002](0002-authentication-google-sso.md) | Authentication — Google SSO with bearer JWT |
| [0003](0003-flat-multi-user-tenancy.md) | Flat multi-user tenancy with row-level ownership |
| [0004](0004-task-metadata-jsonb.md) | Task metadata as JSONB, with snapshot-to-log |
| [0005](0005-pull-based-no-notifications.md) | Pull-based — no notifications |
| [0006](0006-rig-as-maintenance-aggregate.md) | Rig as the aggregate for maintenance (refines 0003) |
| [0007](0007-photo-field-type-garage-s3.md) | Photo field type, stored in Garage S3 (extends 0004) |
| [0008](0008-step-custom-fields.md) | Step custom fields (extends 0004) |
| [0009](0009-nx-workspace-layout.md) | Nx workspace layout — pnpm, Zod shared domain, scope/type boundaries |
| [0010](0010-mvp-scope.md) | MVP scope — full core loop, mobile-first PWA, photos deferred |
| [0011](0011-redux-rtk-state.md) | Web state management — Redux Toolkit with RTK Query |
| [0012](0012-google-one-tap-passport-refresh-tokens.md) | Google One Tap + Passport, rotating refresh tokens for long sessions (refines 0002) |
| [0013](0013-styling-tailwind-mobile-first.md) | Styling — Tailwind CSS v4, mobile-first by construction; shared primitives in `libs/web/ui` |
| [0014](0014-shadcn-vendored-controls.md) | Controls — shadcn/ui vendored into `libs/web/ui`, semantic tokens bridged to the camping palette (extends 0013) |
| [0015](0015-multi-basis-maintenance-intervals.md) | Multi-basis maintenance intervals (calendar/distance) + stored due-status inputs (amends 0005) |
| [0016](0016-interval-combined-limits.md) | An Interval carries both limits, due on whichever elapses first (amends 0015) |
| [0017](0017-task-tags-denormalized-array.md) | Task tags as a denormalized text array |
| [0018](0018-true-hybrid-ssr-web-architecture.md) | True hybrid SSR web architecture — server-rendered pages, Pattern C data seeding, rig-scoped routes (supersedes 0001 web-tier/data-path, amends 0011) |
| [0019](0019-cookie-token-transport.md) | Cookie token transport — httpOnly cookies scoped to `.rv.<apex>` (amends 0002, 0012) |
| [0020](0020-public-repo-homelab-deployment-split.md) | Public-repo / homelab deployment split — generic config here, IaC specifics in homelab repo (supersedes 0001 topology) |
| [0021](0021-mcp-server-inside-api.md) | MCP server inside the API — stateless `POST /api/mcp` via pinned `@rekog/mcp-nest`, direct service calls, no OAuth advertised |
| [0022](0022-mcp-token-lifecycle.md) | MCP token lifecycle — opaque `rvmcp_` secret, hashed at rest, show-once, one active token, non-expiring, managed in an avatar-menu dialog |
| [0023](0023-mcp-tool-surface.md) | MCP tool surface — 15 tools: reads on every resource with server-computed `dueStatus`, writes on checklists and maintenance tasks only; tools only, no resources or prompts |
| [0024](0024-mcp-oauth-authorization.md) | MCP OAuth 2.1 authorization — `@rekog/mcp-nest-auth` server, dual auth with the static `rvmcp_` token, open DCR with allowlisted redirects, 30-day JWTs with per-call grant check, Connected apps page (amends 0021, 0022) |
| [0025](0025-google-maps-leg-distances.md) | Google Maps for leg distances — Routes API + Places (New), place IDs stored, on-demand fetch pre-fills the editable leg |
| [0026](0026-stop-attachments-shared-garage-bucket.md) | Stop attachments — shared Garage bucket, API-proxied, campground-map flag, hard-delete cascade (extends 0007) |
| [0027](0027-mcp-trips-and-stops-tools.md) | MCP trips and stops tools — full CRUD incl. `mark_stop_arrived`; arrival writes the rig's Distance as a service-owned side effect (amends 0023) |

## Archived prototypes

Throwaway UI prototypes that informed production code are preserved on
local branches as primary source (not merged into `main`).

| Branch | Contents | Decisions folded into |
|--------|----------|-----------------------|
| `prototype/ui-prototypes` | `maintenance-prototype/` — maintenance-list layout, pushState/popstate navigation, card-based task display | Issues #38–#43 (maintenance list, history, tags, intervals, checklists) |
| `prototype/ui-prototypes` | `maintenance-history-prototype/` — timeline/history view, variant-A layout with grouped entries | Issue #43 (maintenance history view) |

The domain model (entities, relationships, ubiquitous language) lives in
`CONTEXT.md` at the repo root, written as the domain-model ticket (#2) is walked.

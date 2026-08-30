# Architecture Decision Records

This directory holds the permanent record of the important decisions of this
project. Each architecture decision record (ADR) holds one decision, its context,
the alternatives that the team compared, and the consequences.

The Wayfinder map (issue #1) and its tickets show the *route* to each decision.
The ADRs in this directory are the *source of truth* that a build reads.

| ADR | Decision |
|-----|----------|
| [0001](0001-deployment-and-connectivity.md) | The deployment and connectivity structure. An SSR Worker, NestJS in k3s through a CF Tunnel, and a direct connection from the browser to the API. |
| [0002](0002-authentication-google-sso.md) | Authentication with Google SSO and a bearer JWT. |
| [0003](0003-flat-multi-user-tenancy.md) | Flat tenancy for more than one user, with ownership on each row. |
| [0004](0004-task-metadata-jsonb.md) | Task metadata as JSONB, copied into the log. |
| [0005](0005-pull-based-no-notifications.md) | The application is pull-based. It sends no notification. |
| [0006](0006-rig-as-maintenance-aggregate.md) | The rig is the aggregate for maintenance. This refines 0003. |
| [0007](0007-photo-field-type-garage-s3.md) | The photo field type, stored in Garage S3. This extends 0004. |
| [0008](0008-step-custom-fields.md) | Custom fields on a step. This extends 0004. |
| [0009](0009-nx-workspace-layout.md) | The layout of the Nx workspace. It uses pnpm, a shared domain with Zod, and boundaries by scope and type. |
| [0010](0010-mvp-scope.md) | The scope of the MVP. It has the full core loop and a mobile-first PWA. The photos come later. |
| [0011](0011-redux-rtk-state.md) | State management on the web with Redux Toolkit and RTK Query. |
| [0012](0012-google-one-tap-passport-refresh-tokens.md) | Google One Tap with Passport, and refresh tokens that rotate, for long sessions. This refines 0002. |
| [0013](0013-styling-tailwind-mobile-first.md) | Styling with Tailwind CSS v4, mobile-first by construction. The shared primitives are in `libs/web/ui`. |
| [0014](0014-shadcn-vendored-controls.md) | The controls come from shadcn/ui, copied into `libs/web/ui`. The semantic tokens connect to the camping palette. This extends 0013. |
| [0015](0015-multi-basis-maintenance-intervals.md) | Maintenance intervals with more than one basis: calendar and distance. The inputs to the due status are stored. This amends 0005. |
| [0016](0016-interval-combined-limits.md) | An interval carries both limits. The task is due at the first limit that elapses. This amends 0015. |
| [0017](0017-task-tags-denormalized-array.md) | Task tags as a denormalized text array. |
| [0018](0018-true-hybrid-ssr-web-architecture.md) | A true hybrid SSR web architecture. It has server-rendered pages, Pattern C data seeding, and rig-scoped routes. This supersedes the web tier and the data path of 0001, and amends 0011. |
| [0019](0019-cookie-token-transport.md) | Tokens travel in httpOnly cookies with the scope `.rv.<apex>`. This amends 0002 and 0012. |
| [0020](0020-public-repo-deployment-split.md) | The public repository and the deployment are separate. The generic configuration is here. A private repository holds the details of each environment and deploys them. This supersedes the structure of 0001. |
| [0021](0021-mcp-server-inside-api.md) | The MCP server is inside the API. It is a stateless `POST /api/mcp` endpoint that uses a pinned `@rekog/mcp-nest`. It calls the services directly and advertises no OAuth. |
| [0022](0022-mcp-token-lifecycle.md) | The lifecycle of an MCP token. The token is an opaque `rvmcp_` secret. The application hashes it in the database, shows it one time, permits one active token, and does not expire it. The user manages the token in a dialog from the avatar menu. |
| [0023](0023-mcp-tool-surface.md) | The MCP tools. There are 15 tools. Each resource has a read tool, and the server calculates `dueStatus`. The write tools cover the checklists and the maintenance tasks only. The server exposes tools only. It exposes no resource and no prompt. |
| [0024](0024-mcp-oauth-authorization.md) | Authorization for MCP with OAuth 2.1. It uses a `@rekog/mcp-nest-auth` server and two authentication methods, with the static `rvmcp_` token as the second method. Dynamic client registration is open, and the redirects come from an allowlist. The JWTs are valid for 30 days, and each call checks the grant. The user manages the grants on a Connected apps page. This amends 0021 and 0022. |
| [0025](0025-google-maps-leg-distances.md) | Google Maps supplies the leg distances. It uses the Routes API and Places (New), and the application stores the place IDs. An automatic request fills the leg, and the leg stays editable. This ADR was amended in place, in issue #121. |
| [0026](0026-stop-attachments-shared-garage-bucket.md) | Attachments on a stop. They use a shared Garage bucket through a proxy in the API. One attachment can carry the campground-map flag. A delete removes the file and cascades. This extends 0007. |
| [0027](0027-mcp-trips-and-stops-tools.md) | The MCP tools for trips and stops. They give full CRUD, and they include `mark_stop_arrived`. An arrival writes the Distance of the rig as a side effect that the service owns. This amends 0023. |
| [0028](0028-offline-first-pwa-powersync.md) | An offline-first PWA. It has a PowerSync local store, writes through the API from an operation queue, last-write-wins for each record, a Serwist-runtime service worker, and offline attachments. This amends 0018, 0012, and 0011. It extends 0026. |
| [0029](0029-powersync-read-path-into-rtk-query.md) | The PowerSync read path. Watch queries write into the RTK Query cache with `upsertQueryEntries`, after the first sync completes. The order of precedence is the local store, then the network, then the SSR seed. This amends the read path of 0028. |
| [0030](0030-run-step-operations-merged-server-side.md) | Run steps. The server merges the operations of each step by step id. The stamps of each step are inside the jsonb value, and the newest stamp wins for each step. The server checks the Log Entry links that the client made. This amends the per-record last-write-wins of 0028 for the steps array. |

`CONTEXT.md` at the root of the repository holds the domain model. It gives the
entities, the relations, and the common language. The team writes it during the
domain-model ticket (#2).

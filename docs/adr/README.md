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

The domain model (entities, relationships, ubiquitous language) lives in
`CONTEXT.md` at the repo root, written as the domain-model ticket (#2) is walked.

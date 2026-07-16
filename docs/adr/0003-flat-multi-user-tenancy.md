# 3. Flat multi-user tenancy with row-level ownership

Date: 2026-07-16

## Status

Accepted

## Context

Today there is one intended user, but the owner wants to sign in regardless and
may let friends use the app later. The question is how much tenancy to build now
without either over-engineering or painting into a corner.

## Decision

- **Flat multi-user.** Multiple real user accounts may exist; there are **no
  organizations, teams, or tenant-isolation boundaries**.
- **Row-level ownership.** Top-level entities carry an `owner_id`; every query is
  scoped to the signed-in user.
- **Deferred:** true multi-tenancy — tenant isolation guarantees, self-serve
  onboarding, billing, admin tooling.

"Friends later" becomes *turn on registration (and optional sharing)* — not a
data-model migration.

## Alternatives considered

- **Single-user / no auth** (rely on private network) — rejected; the owner
  wants sign-in and per-user data.
- **Full multi-tenant SaaS** now — rejected; orgs, isolation, onboarding, and
  billing are a product, not a personal tool.

## Consequences

- `owner_id` appears on aggregate roots from day one; all reads/writes are
  owner-scoped.
- Authentication exists from the start (see ADR-0002).
- Multi-tenancy stays cheap to add later precisely because data is already
  owner-scoped and auth already exists.

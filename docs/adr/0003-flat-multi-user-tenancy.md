# 3. Flat tenancy for more than one user, with ownership on each row

Date: 2026-07-16

## Status

Accepted.

## Context

At this time there is one intended user. But the owner wants to sign in, and the
owner can permit friends to use the application later.

The question is how much tenancy to build now. We must not build too much, and we
must not prevent a later change.

## Decision

- **Flat, with more than one user.** More than one real user account can exist.
  There are **no organizations, no teams, and no boundaries that isolate a
  tenant**.
- **Ownership on each row.** Each top-level entity carries an `owner_id`. Each
  query is limited to the user who signed in.
- **Not now**: true multi-tenancy. This includes guarantees that isolate a
  tenant, self-service onboarding, billing, and tools for an administrator.

To add friends later, we start the registration function and possibly a sharing
function. We do not change the data model.

## Alternatives that we compared

- **One user, with no authentication**, on a private network. We rejected this
  alternative. The owner wants a sign-in and data for each user.
- **Full multi-tenant SaaS now.** We rejected this alternative. Organizations,
  isolation, onboarding, and billing make a product. This application is a
  personal tool.

## Consequences

- Each aggregate root carries `owner_id` from the first day. Each read and each
  write is limited to the owner.
- Authentication exists from the start. Refer to ADR-0002.
- Multi-tenancy stays inexpensive to add later. This is true because the data is
  already limited to an owner, and because authentication already exists.

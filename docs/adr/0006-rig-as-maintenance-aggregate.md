# 6. Rig as the aggregate for maintenance

Date: 2026-07-16

## Status

Accepted

Refines the ownership chain in ADR-0003.

## Context

Maintenance tasks, checklists, and their history need a clear target. Scoping
them to a *person* is wrong: the thing being maintained is the RV ("rig"), a
person may own more than one, and rigs get sold or traded in the real world. The
rig is also the natural home for a growing "true record of the RV." Introducing
the entity now is cheaper than retrofitting a `rig_id` onto tasks, checklists,
and logs later.

## Decision

- Introduce a **Rig** as a first-class entity **now** (not deferred). A user may
  own several (**multi-rig**).
- A Rig captures identifying / real-world info: **VIN, make, model, year** (and
  a user-facing name/nickname for display).
- **Maintenance tasks, checklists, and completion logs scope to a Rig**, not
  directly to the User. Ownership chain: **`User → Rig → {Task, Checklist, Log
  entry}`**. The Rig carries `owner_id`; child entities reference `rig_id`. This
  refines ADR-0003 — row-level ownership is expressed via the rig.
- **Rigs do not transfer between users.** A rig belongs to one user; there is no
  in-app ownership-transfer / sale flow. A real-world sale simply ends outside
  the app.

## Alternatives considered

- **Scope maintenance to the User directly (no Rig)** — rejected; maintenance
  against a person is meaningless, breaks with multiple rigs, and loses the
  rig-centric record.
- **Add the Rig later** — rejected; retrofitting `rig_id` across tasks,
  checklists, and logs is more expensive than introducing it up front.
- **Rig ownership transfer between users** — rejected / out of scope; rigs do
  not move between users.

## Consequences

- `rig_id` appears on tasks, checklists, and log entries from day one; queries
  scope by the signed-in user's rigs.
- Choosing/entering a rig becomes part of first-run onboarding (MVP scope, #7).
- The Rig is the anchor for a richer record over time.

## Future (deferred — not now)

- A **Problem** entity (defects / issues on the rig).
- An **Update / modification** entity (mods, upgrades).

Both are tracked as fog on the map, not built now.

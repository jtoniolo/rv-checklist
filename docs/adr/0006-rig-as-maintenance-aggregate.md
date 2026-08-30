# 6. The rig is the aggregate for maintenance

Date: 2026-07-16

## Status

Accepted.

This ADR refines the chain of ownership in ADR-0003.

## Context

The maintenance tasks, the checklists, and their history need a clear target.

A *person* is the incorrect target. The object that a person maintains is the RV,
which this project calls the rig. A person can own more than one rig. Also, a
person can sell a rig or exchange it.

The rig is also the correct location for a record of the RV that grows with time.

If we make this entity now, the cost is lower. If we add a `rig_id` to the tasks,
the checklists, and the logs later, the cost is higher.

## Decision

- Make a **Rig** entity **now**. It is a first-class entity. Do not do this work
  later. A user can own more than one rig.
- A Rig holds the data that identifies it in the real world: the **VIN**, the
  **make**, the **model**, and the **year**. It also holds a name or a nickname
  for the display.
- **The maintenance tasks, the checklists, and the completion logs belong to a
  Rig.** They do not belong directly to the User. The chain of ownership is
  **`User → Rig → {Task, Checklist, Log entry}`**. The Rig carries `owner_id`.
  Each child entity refers to a `rig_id`.

  This refines ADR-0003. The rig expresses the ownership on each row.
- **A rig does not move from one user to a different user.** A rig belongs to one
  user. The application has no procedure to transfer the ownership or to sell the
  rig. A sale in the real world ends outside the application.

## Alternatives that we compared

- **Attach the maintenance directly to the User, with no Rig.** We rejected this
  alternative. Maintenance on a person has no meaning. It also fails when the
  person owns more than one rig, and it loses the record that centers on the rig.
- **Add the Rig later.** We rejected this alternative. To add `rig_id` to the
  tasks, the checklists, and the logs later costs more than to make the entity
  now.
- **Transfer the ownership of a rig between users.** We rejected this
  alternative. It is out of scope. A rig does not move between users.

## Consequences

- The tasks, the checklists, and the log entries carry `rig_id` from the first
  day. Each query is limited to the rigs of the user who signed in.
- The first-run onboarding must let the user select or enter a rig. This is in
  the scope of the MVP, in issue #7.
- The Rig is the anchor for a larger record in the future.

## Future work, which we do not do now

- A **Problem** entity, for the defects and the faults on the rig.
- An **Update** entity, for the modifications and the improvements.

The map records these two as areas that are not yet clear. We do not build them
now.

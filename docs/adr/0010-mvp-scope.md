# 10. The scope of the MVP: the full core loop, mobile-first, with no photos

Date: 2026-07-17

## Status

Accepted.

## Context

Each domain decision and each architecture decision is now fixed. Refer to
ADR-0001 to ADR-0009 and to `CONTEXT.md`. We must now decide the content of the
first build.

The application is a personal tool for a known user. Thus there is no pressure
from a market to release a minimal part early. But there is a real risk that the
first deployment stops. Two conditions can stop it: unnecessary work on the
infrastructure for object storage, and the work to write the content.

The usual condition of use is important. The owner uses the application **on a
telephone or a tablet, while the owner walks around the rig**. The owner packs,
does procedures, and does maintenance at that time. Use on a desktop computer is
secondary.

## Decision

**The MVP contains:**

- **The full core loop.** This is the checklists, the steps, the runs with their
  three step states (incomplete, complete, and skipped), the maintenance tasks,
  the steps that link to a task, the log entries, and the completion of a task
  alone.

  If we removed the maintenance, this application would be a checklist
  application with no special value. The step that links to a task is the
  primary idea.
- **Full authoring of a checklist.** The user can create, edit, reorder, and
  delete a checklist and its steps. The application also **supplies starter
  checklists**.

  A starter checklist is an ordinary editable checklist that the application
  makes for the user. It is not a separate read-only object. A read-only object
  would disagree with the domain model, in which a checklist *is* the editable
  template of the user. The content of the starter checklists is separate work,
  in issue #9.
- **Custom fields** on the tasks and on the plain steps. Refer to ADR-0004 and
  ADR-0008. The MVP has each field type **except `photo`**.
- **The display of the due status and the overdue status**, calculated on a read.
  Refer to ADR-0005. This display is the full value of the recorded intervals,
  and it costs one comparison in a query.
- **A user interface for more than one rig.** The user can create a rig, see the
  list of rigs, and change to a different rig. The domain already permits more
  than one rig. Refer to ADR-0006. An interface for one rig would be an
  artificial limit.
- **Each record stays editable after its creation.** This includes the runs and
  the log entries. The domain model requires this.
- **A mobile-first user interface. This is a firm requirement.** Release the
  application as an installable **PWA**, with a manifest and an install-to-home-
  screen function. This keeps the mobile-first discipline. The MVP does not
  operate offline.
- Google SSO. Refer to ADR-0002.

**The MVP does not contain:**

- **The `photo` field type** and its Garage S3 infrastructure. ADR-0007 continues
  to give the method. No part of the shape of the JSONB field schema prevents a
  later addition of the type.

  We removed the photo type because it is the one field type that needs real
  infrastructure. That infrastructure is Garage and the proxied uploads, and it
  has no relation to the core loop.
- **Use with no network.** This stays on the map as an area for later work.
- **A larger record of the rig**, with the Problems and the Updates. ADR-0006
  already puts this in the same category.

**These items stay out of scope**, with no change: the notifications, from
ADR-0005, and true multi-tenancy, from ADR-0003.

## Alternatives that we compared

- **An MVP with the checklists only, and no maintenance.** We rejected this
  alternative. The purpose of the application names both parts: "leave nothing
  behind" and "when did I do this last?". A release of one half of the loop gives
  a checklist application with no special value.
- **Read-only templates in place of the authoring functions.** We rejected this
  alternative for a domain reason. By definition, a checklist is the editable
  template of the user. Also, a fixed generic list has almost no value as a
  personal aid to the memory.
- **The photos in the MVP.** We rejected this alternative. The setup of Garage is
  a usual cause of a stopped first deployment. The core loop loses nothing
  necessary without the images.
- **A full offline PWA.** We rejected this alternative for the MVP. The install
  function alone gives the mobile-first benefit, and it does not add the
  complexity of the sync.

## Consequences

- The first build uses the full domain model. Each entity in `CONTEXT.md` is in
  the MVP, except the `photo` field type.
- The design of the user interface starts with the telephone. The desktop layouts
  come from the mobile layouts, and not the opposite. The MVP includes a PWA
  manifest and a service-worker shell, although the application caches nothing
  for offline use.
- The validation of the field types must refuse `photo` until the later work is
  complete. It must not give partial support for that type.
- The content of the starter checklists, in issue #9, is on the critical path of
  the MVP, because the first build includes that content.

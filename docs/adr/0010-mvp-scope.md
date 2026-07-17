# 10. MVP scope — full core loop, mobile-first, photos deferred

Date: 2026-07-17

## Status

Accepted

## Context

Every domain and architecture decision is pinned (ADR-0001–0009, `CONTEXT.md`);
what remains is deciding what the first build actually ships. The app is a
personal tool for a known user, so there is no market pressure to ship a
minimal slice early — but there is a real risk of the first deploy stalling on
infrastructure yak-shaves (object storage) or content authoring.

The defining usage context: the owner uses the app **on a phone or tablet while
walking around the rig** — packing, running procedures, doing maintenance.
Desktop use is secondary.

## Decision

**In the MVP:**

- **The full core loop**: checklists, steps, runs (incomplete / complete /
  skipped step state), maintenance tasks, task-linked steps, log entries, and
  standalone task completion. Cutting maintenance would have made this a
  generic checklist app; the task-linked step is the load-bearing idea.
- **Full checklist authoring** — create, edit, reorder, delete checklists and
  steps — **plus seeded starter checklists**. Seeds are ordinary editable
  checklists pre-created for the user, not a separate read-only concept
  (which would contradict the domain model, where a checklist *is* the
  user's editable template). Seed content is its own effort (#9).
- **Custom fields** on tasks and plain steps (ADR-0004/0008) — all field
  types **except `photo`**.
- **Due / overdue status display**, computed on read (ADR-0005). It is the
  entire payoff of recording intervals and costs a comparison in a query.
- **Multi-rig UI**: create, list, switch. The domain is already multi-rig
  (ADR-0006); a one-rig UI over it would be a fake constraint.
- **Everything editable after the fact** (runs, log entries), per the domain
  model.
- **Mobile-first UI — a hard requirement, not a nice-to-have.** Ship as an
  installable **PWA** (manifest, install-to-home-screen) to reinforce the
  mobile-first discipline. No offline support.
- Google SSO (ADR-0002).

**Deferred to post-MVP:**

- **Photo field type** and its Garage S3 infrastructure. ADR-0007 stands as
  the *how*; nothing in the JSONB field-schema shape blocks adding the type
  later. Deferred because it is the one field type that drags real
  infrastructure (Garage, proxied uploads) unrelated to the core loop.
- **Offline use** — remains in the map's fog for a later effort.
- Rig record growth (Problems, Updates) — already fog (ADR-0006).

**Out of scope** (unchanged): notifications (ADR-0005), true multi-tenancy
(ADR-0003).

## Alternatives considered

- **Checklists-only MVP** (no maintenance) — rejected. The app's purpose names
  both halves ("nothing left behind" + "when did I last do this?"); shipping
  half the loop delivers a generic checklist app.
- **Seeded read-only templates instead of authoring** — rejected on domain
  grounds; a checklist is by definition the user's editable template, and
  canned generic lists are near-worthless as a personal memory aid.
- **Photos in the MVP** — rejected; Garage setup is the classic first-deploy
  staller and the core loop loses nothing essential without images.
- **Full offline PWA** — rejected for MVP; installability alone captures the
  mobile-first benefit without the sync complexity.

## Consequences

- The first build exercises the entire domain model — no entity in
  `CONTEXT.md` is post-MVP except the `photo` field type.
- UI work is designed phone-first; desktop layouts derive from mobile, not the
  reverse. A PWA manifest and service-worker shell ship with the MVP even
  though nothing is cached offline.
- Field-type validation must reject `photo` until the post-MVP effort lands,
  rather than half-supporting it.
- Seed checklist content (#9) is on the MVP critical path, since seeds ship
  with the first build.

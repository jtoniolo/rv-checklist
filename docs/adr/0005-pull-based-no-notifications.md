# 5. Pull-based — no notifications

Date: 2026-07-16

## Status

Accepted

## Context

The owner describes being "forgetful," but the need is not to be *nagged* — it
is to **not miss a step** when running a checklist, and to **see how long since**
a maintenance task was last done so they can judge when to do it again. The
trigger is a real-life event the user initiates ("it's spring, I'm opening the
RV"; "I'm going on a trip"), not a clock.

## Decision

- The app is **pull-based**: a reference the user consults, not a system that
  reaches out.
- **No notifications of any kind** — no push, no email, no scheduled nudges, no
  background scheduler.
- **Due / overdue status is computed on read** from a task's optional interval
  and its last completion, and shown passively when the user opens the app.

## Alternatives considered

- **Email / push reminders driven by a scheduler** (k8s CronJob or NestJS cron)
  — rejected. Explicitly not wanted, and it would add a scheduler plus a delivery
  channel to the deployment for no value the owner asked for.

## Consequences

- No scheduler, job runner, or notification infrastructure in the system or the
  deployment (reinforces ADR-0001's simplicity).
- Due-status is a read-time computation, not stored state to keep in sync.
- If proactive reminders are ever wanted, that is a new effort that reopens this
  decision — it is out of scope today.

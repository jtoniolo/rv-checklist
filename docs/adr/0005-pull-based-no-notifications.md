# 5. The application is pull-based and sends no notification

Date: 2026-07-16

## Status

Accepted.

## Context

The owner says that the owner forgets things. But the owner does not want
frequent reminders.

The owner has two needs. The first need is to **miss no step** during a run of a
checklist. The second need is to **know the time since the last performance** of
a maintenance task, so that the owner can decide when to do it again.

A real event starts the use of the application. The user starts that event.
Examples are "It is spring and I am opening the RV" and "I am going on a trip". A
clock does not start the use.

## Decision

- The application is **pull-based**. It is a reference that the user reads. It is
  not a system that speaks first.
- **The application sends no notification of any type.** It sends no push
  message, no email, and no scheduled reminder. It has no background scheduler.
- **The application calculates the due status and the overdue status on a read.**
  It uses the optional interval of a task and the last completion of that task.
  It shows the status when the user opens the application. It takes no other
  action.

## Alternatives that we compared

- **Reminders by email or by push message, from a scheduler.** The scheduler
  could be a k8s CronJob or a cron function in NestJS. We rejected this
  alternative. The owner does not want it. It also adds a scheduler and a
  delivery channel to the deployment, and the owner asked for no function that
  needs them.

## Consequences

- The system and the deployment have no scheduler, no job runner, and no
  notification infrastructure. This keeps the simple structure of ADR-0001.
- The due status is a calculation at the time of a read. It is not a stored value
  that the application must keep current.
- A person can want reminders in the future. That is new work, and it opens this
  decision again. It is out of scope now.

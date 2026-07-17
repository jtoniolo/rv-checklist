# RV Checklist & Maintenance Tracker

A personal aid for an RV owner whose failure mode is **object permanence** — what's out of sight gets missed. Checklists exist to surface out-of-sight things at the moment they matter: nothing left behind when packing, no unseen step missed in a procedure. (Things in plain view need no checklist — there is no campsite-setup list.) Maintenance tracking exists so "when did I last do this?" always has an answer. The app is pull-based: it answers when asked, it never nags.

## Language

**Rig**:
An RV owned by a user, identified by VIN, make, model, year, and a nickname. Everything — checklists, tasks, logs — belongs to a rig, not directly to a user. A user may own several.
_Avoid_: RV, vehicle, camper

**Checklist**:
A reusable, ordered template of steps for a procedure or packing job (e.g. pre-departure, spring opening, a packing list). Identified by its name, with optional free-form tags for organizing (packing lists vary by trip length; there is no fixed category system). It is a template — it can be edited over time, and running it never modifies it.
_Avoid_: checklist template (redundant — a checklist IS the template), list, event type (categories are just tags)

**Step**:
One ordered entry in a checklist — a thing to do or an item to pack, worked through during a run. Most steps are plain text ("close roof vents", "pack the coffee maker"). A step may optionally reference a maintenance task when completing it constitutes performing maintenance. A plain step may define its own custom fields (e.g. "fresh water level"); completing it captures the values onto the run's copy of the step. A task-linked step never defines its own fields — its fields come from the task.
_Avoid_: item (ambiguous with packed belongings), task (reserved for maintenance)

**Step state**:
Within a run, each step is **incomplete**, **complete**, or **skipped** — not a boolean. Skipped is a deliberate "not doing this one" (primary case: leaving an item home on purpose), distinct from simply not done yet. Only *completing* a task-linked step records maintenance; skipping records nothing.
_Avoid_: checked/unchecked, ticked

**Run**:
A dated copy of a checklist's steps, created when the user starts working through it for a real occasion, holding per-step state (incomplete / complete / skipped). It is a copy only because the checklist can change over time — later checklist edits don't alter past runs. Nothing is locked: runs and their answers stay editable so the user can always go back and correct things.
_Avoid_: instance, session, execution, snapshot-as-frozen (a run is a copy, not an immutable record)

**Maintenance Task**:
A recurring upkeep job on a rig (e.g. "condition slide seals"), with an optional interval and user-defined custom fields. It may be referenced by steps on any number of checklists, or performed standalone. No interval means it is not tracked for due-status.
_Avoid_: job, chore, todo

**Interval**:
The optional recurrence period on a maintenance task (e.g. every 12 months). Drives passive due/overdue, computed on read from the last completion. Nothing notifies.

**Log Entry**:
The record that a maintenance task was performed on a date. Carries its own copy of the task's fields as they were when recorded, with the recorded values — so later edits to the task don't alter it. Like everything else, it stays editable; the user can correct past entries.
_Avoid_: completion (as a noun for the record), history item

# RV Checklist & Maintenance Tracker

A personal aid for an RV owner whose failure mode is **object permanence** — what's out of sight gets missed. Checklists exist to surface out-of-sight things at the moment they matter: nothing left behind when packing, no unseen step missed in a procedure. (Things in plain view need no checklist — there is no campsite-setup list.) Maintenance tracking exists so "when did I last do this?" always has an answer. The app is pull-based: it answers when asked, it never nags.

## Language

**Rig**:
An RV owned by a user, identified by VIN, make, model, year, and a nickname. Everything — checklists, tasks, logs — belongs to a rig, not directly to a user. A user may own several. A rig also carries a current **Distance** — the yardstick a distance-based maintenance interval is measured against — and an **Equipment** list. Rig type is not modelled: a rig may be towable or driveable, and nothing here assumes one or the other.
_Avoid_: RV, vehicle, camper

**Distance**:
How far a rig has travelled — driven or towed — as a running total in **kilometres**, kept current by the owner (a future trip logger may maintain it automatically). It is the yardstick for an **Interval**'s distance limit: a task due "every 20,000 km" compares the rig's current Distance against the Distance recorded when the task was last performed. Trailers have no odometer, so this is an owner-maintained figure, not an instrument reading.
_Avoid_: mileage, odometer (a towable rig has no odometer), miles (kilometres only)

**Equipment**:
A notable item on a rig — generator, batteries, solar system, vent fan — whether factory-installed or added later (origin is not modelled; provenance goes in notes when it matters). Purely descriptive inventory: the app computes nothing from it. It exists so a reader of the rig — chiefly an AI agent authoring maintenance — knows what the rig carries. An item has a name and, optionally, make, model, **purchase date** (the warranty anchor; install lag is trivial and not recorded), free-text notes (specs, warranty length, provenance), and a **Cost** — what was paid to buy and install it, blank for factory items. Warranty is not tracked: the purchase date plus a note is enough for a reader to judge warranty status. Maintenance on equipment is an ordinary Maintenance Task; equipment items are not tracked, not linked to tasks, and never due. Removing an item deletes it — no history is kept.
_Avoid_: upgrade, mod, addition (origin does not matter), accessory, gear (reserved for packed belongings), asset

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
An upkeep job on a rig (e.g. "condition slide seals"), with an optional free-text description (why it needs doing and how to perform it — absent means absent) and user-defined custom fields. It may be referenced by steps on any number of checklists, or performed standalone. A task is tracked for due-status one of two mutually exclusive ways — by an interval (recurring) or as one-time — or not at all. No interval and no one-time marker means it is simply not tracked.
_Avoid_: job, chore, todo

**Interval**:
The recurrence period on a recurring maintenance task, carrying up to two **limits**: a **calendar** cadence (e.g. every 12 months) and/or a **Distance** cadence (e.g. every 20,000 km). At least one limit is present; either may be omitted (a blank cadence is simply ignored). When both are present the task is due when **whichever elapses first** is reached — the earlier of the two triggers, the way a real distance schedule reads ("every 2 years or 30,000 km, whichever comes first"). Optional as a whole and mutually exclusive with the one-time marker. Drives passive due/overdue, computed on read from when the task was **last performed** — and, for the distance limit, the rig's current Distance. Nothing notifies. A task whose event trigger is "before every trip" or "after any wheel removal" is **not** an interval — that belongs on a checklist as a Step; a season ("each fall") is a calendar limit anchored by its last-performed date, not a limit of its own.
_Avoid_: schedule (nothing is scheduled), track-by/basis (an interval is not one-of-two — it may carry both limits), mileage/hours (distance is kilometres; run-hours are out of scope)

**Last performed**:
The date a maintenance task was most recently performed — the anchor a calendar interval's next due date is computed from. Normally the date of the newest **Log Entry**, but the owner may set it directly, even with no Log Entry, to anchor a task without logging it: a fresh task, a season-anchored one, or an age-based replacement anchored to a manufacture date. When both exist, the **later** of the manual date and the newest Log Entry wins — a real completion always supersedes a guess. Anchors the **calendar** limit only; the distance limit anchors solely off a logged Distance reading, whether or not the same interval also carries a calendar limit.
_Avoid_: baseline, anchor date (internal terms — the owner sees "last performed")

**One-time task**:
A maintenance task noticed once and done once (e.g. trim came loose on the road, a vent-fan remote battery died, replenish the first-aid kit after use). It is an ordinary Maintenance Task — same list, same perform flow, same log — marked one-time instead of carrying an interval. It is due from the moment it's created and surfaces alongside due/overdue maintenance until dealt with; performing it writes a Log Entry like any other completion, then the task deletes itself. The Log Entry remains as the permanent record (name and fields snapshotted, surviving the task's deletion). Standalone only — never linked to a step. Ordinary editable content, custom fields included, until completed.
_Avoid_: reminder, one-off (reserved for an untracked task with no interval)

**Tags**:
An optional set of short labels on a maintenance task, used for filtering and organising tasks without imposing a fixed category system (the same idea as checklist tags — there is no hierarchy or predefined vocabulary). Stored in **canonical form** (trim + lowercase) so "Tires" and "tires" are the same tag: adding a tag that canonicalises to an existing one re-selects the existing tag, not creating a duplicate. Tags are denormalised on the task row (`text[]`) because there is no metadata on the tag itself and no cross-rig tag queries. The list filters by one or more selected tags with AND logic: a task must carry every selected tag to match.
_Avoid_: category (tags are flat, not hierarchical), label (reserved for UI text)

**Log Entry**:
The record that a maintenance task was performed on a date. Carries its own copy of the task's fields as they were when recorded, with the recorded values — so later edits to the task don't alter it — and, optionally, the rig's **Distance** reading (km) at the time, the anchor a distance interval's next due is measured from, and/or the **Cost** of the work (entered in dollars and cents, stored as integer cents `costCents` so totals stay exact). Like everything else, it stays editable; the user can correct past entries.
_Avoid_: completion (as a noun for the record), history item

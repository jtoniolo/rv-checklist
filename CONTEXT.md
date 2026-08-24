# RV Checklist & Maintenance Tracker

A personal aid for an RV owner whose failure mode is **object permanence** — what's out of sight gets missed. Checklists exist to surface out-of-sight things at the moment they matter: nothing left behind when packing, no unseen step missed in a procedure. (Things in plain view need no checklist — there is no campsite-setup list.) Maintenance tracking exists so "when did I last do this?" always has an answer. The app is pull-based: it answers when asked, it never nags.

## Language

**Rig**:
An RV owned by a user, identified by VIN, make, model, year, and a nickname. Everything — checklists, tasks, logs — belongs to a rig, not directly to a user. A user may own several. A rig also carries a current **Distance** — the yardstick a distance-based maintenance interval is measured against — an **Equipment** list, and optional **Dimensions**. Rig type is not modelled: a rig may be towable or driveable, and nothing here assumes one or the other.
_Avoid_: RV, vehicle, camper

**Distance**:
How far a rig has travelled — driven or towed — as a running total in **kilometres**, kept current by the owner (marking a **Trip**'s stops arrived maintains it automatically; manual entry remains for corrections). It is the yardstick for an **Interval**'s distance limit: a task due "every 20,000 km" compares the rig's current Distance against the Distance recorded when the task was last performed. Trailers have no odometer, so this is an owner-maintained figure, not an instrument reading.
_Avoid_: mileage, odometer (a towable rig has no odometer), miles (kilometres only)

**Dimensions**:
The rig's fixed physical measurements, recorded once on the rig and consulted mid-trip ("can I drive under this?", "can I park here and still deploy the slide?"). All optional: **travel height** (ground to the highest point as driven), **length** (the rig alone), **combined length** (rig plus whatever tows it or is towed with it, measured hitched — never computed by adding, because the hitch overlaps), and two **side clearances** — how far the slide or awning reaches out from the wall on the **passenger side** and **driver side** when fully deployed. Every value is the measured figure with no safety margin baked in; the owner judges margin in the moment. Metric is canonical: entered metric, displayed metric first with feet-and-inches alongside (US roadside clearance signs are imperial), and the imperial figure always rounds **up** — overstating the rig's size is the safe error.
_Avoid_: height/clearance unqualified (say travel height or side clearance), width (a side clearance is a deployment reach, not the rig's width), trailer/truck (rig type is not modelled — length and combined length fit towable and driveable alike)

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
A dated copy of a checklist's steps, created when the user starts working through it for a real occasion, holding per-step state (incomplete / complete / skipped). It is a copy only because the checklist can change over time — later checklist edits don't alter past runs. Nothing is locked: runs and their answers stay editable so the user can always go back and correct things. A run may be linked to a **Trip** as a grouping of convenience; the same checklist may be run any number of times on one trip.
_Avoid_: instance, session, execution, snapshot-as-frozen (a run is a copy, not an immutable record)

**Trip**:
A named journey of a rig from an explicitly set starting point (free text plus a Google place reference, the same shape as a stop's location) through an ordered sequence of **Stops** — planned first, then logged as it happens, one editable record throughout (no separate plan and log, no planned-vs-actual). In the app a trip is created whole — a Google-picked start place and at least one stop, saved in one request — because a start point without a place can't feed the first leg and a trip without stops is not a trip; older trips with a text-only start point or no stops stay readable, but editing the start point demands a place pick and the last stop can't be deleted (delete the trip instead). A trip is one-way: it ends wherever its last stop is. No home base exists; a return journey is its own trip, and leaving the rig somewhere for a season is simply the gap between two trips. A trip belongs to one rig. Checklists associate with trips many-to-many as a grouping of convenience; runs are started on demand and link to the trip, never to a stop. Trip status (planned / underway / completed) is derived from which stops are arrived, never stored.
_Avoid_: journey/voyage, round trip (each direction is its own trip), itinerary, trip type (short vs long is emergent from the linked checklists)

**Current trip**:
The one trip a rig's owner is most likely to want right now: the **underway** trip if one exists, otherwise the **planned** trip with the earliest start (its first stop's arrival date). Derived, never stored — it follows from trip status, which is itself derived. A rig with no underway and no planned trips has no current trip.
_Avoid_: active trip, next trip (the current trip may already be underway)

**Stop**:
One ordered overnight halt on a trip — a rest stop en route or the destination itself; the last stop is where the trip ends. It is the one-stop shop for arrival, holding what would otherwise be dug out of emails — all optional: campground, campsite, arrival date, nights, check-in and check-out times, booking number, **Cost**, address, phone, free-text notes (gate codes, wifi). A stop's location is free text with an optional **Google place reference** (place ID) — there is no reusable place record; picking a place via autocomplete may pre-fill address and phone, which the owner then owns and may edit. It also carries the **leg**: the distance in km driven into this stop from the previous stop or the trip's starting point. The leg fills itself from Google Maps whenever both ends carry a place reference (on add, on a place change at either end, and recalculated on reorder and delete); the fetched value arrives rounded to the nearest 5 km and is always the owner's editable figure. A leg the owner typed is never overwritten automatically, nor is an arrived stop's; an explicit re-fetch remains, and manual entry is the fallback when an end has no place reference. Marking a stop **arrived** logs its leg onto the rig's **Distance**; editing an arrived stop's leg adjusts the rig by the difference. A stop may also carry **Attachments**.
_Avoid_: waypoint, destination (as an entity — the destination is just the last stop), leg (as a synonym for stop — a leg is the drive into a stop)

**Attachment**:
A file kept on a stop, so arrival paperwork lives with the stop instead of in email — an image (pasted from the clipboard, chosen with a file picker, or captured with the phone camera) or a PDF. At most one attachment on a stop is flagged as the **campground map**: the layout image the campground supplies, used after arrival to find the way inside the grounds. The campground map is not the navigation link — the navigation link (built from the stop's Google place reference) drives the rig *to* the stop; the campground map orients the owner *within* it. Never conflate the two. Attachments belong to stops only, never to trips; deleting a stop deletes its attachments, and nothing is retained.
_Avoid_: photo (reserved for the maintenance photo field type), document, campsite map (the map shows the whole campground, not one site), upload (the act, not the thing)

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
The record that a maintenance task was performed on a date. Carries its own copy of the task's fields as they were when recorded, with the recorded values — so later edits to the task don't alter it — and, optionally, the rig's **Distance** reading (km) at the time, the anchor a distance interval's next due is measured from, and/or the **Cost** of the work (entered in dollars and cents, stored as integer cents `costCents` so totals stay exact), and/or a short free-text **Comment** (`comment`, multi-line, max 500 characters) — findings, an unusual observation, or the method used. Like everything else, it stays editable; the user can correct past entries.
_Avoid_: completion (as a noun for the record), history item

## Offline

The app works fully off grid ([ADR-0028](docs/adr/0028-offline-first-pwa-powersync.md)):
everything writable online is writable offline, and sync is automatic — there is
no sync button. Terms the offline architecture introduced:

**Local store**:
The on-device copy of the owner's data (a PowerSync SQLite database) that the UI
always reads from, online and offline. The sync engine keeps it current; the
server remains the source of truth.
_Avoid_: cache (the local store is authoritative for rendering, not a copy that may be dropped), offline database (it is used online too)

**Sync**:
The background exchange that keeps the local store and the server aligned:
downloads stream in continuously while connected, and queued writes replay
through the API automatically on app open and on reconnect. Never a user
action.
_Avoid_: backup, refresh (reserved for tokens), manual sync (does not exist)

**Newest wins**:
The collision rule: when two devices edit the same record, the later edit (by
client edit time, clamped to server time) is kept, enforced server-side. Delta
operations — Distance additions — are exempt and always apply. There is no
merge screen. Run steps merge per step so two devices completing different
steps both count.
_Avoid_: conflict resolution UI, merge (nothing merges except run steps)

**Pending**:
A queued offline write — most visibly a **pending attachment**: captured
offline, held in the device outbox with a "waiting to upload" badge, uploaded
by the browser even if the app is closed. Pending things exist only on the
device that created them until they upload.
_Avoid_: draft (it will send itself; a draft waits for the user), unsynced (pending is the user-facing word)

**Warming**:
Pre-caching the current trip's pages and attachments — campground maps first —
onto the device while connectivity lasts, so arrival works off grid. Triggered
when a trip becomes current, when a new attachment appears on the current trip,
and on app open while online.
_Avoid_: preload, download manager (there is no user-visible download control)

**Offline fallback page**:
What the app shows off grid when the owner asks for a page this device has
never opened: it says so and links to the pages that are on the device. Every
page they have opened before is served from the device instead and looks
exactly as it always does.
_Avoid_: error page, not found (the page exists — this device just does not have a copy)

**Offline indicator**:
The app-wide header signal that the device is offline, driven by the sync
engine's connection state. Degraded-by-nature functions (place autocomplete,
automatic leg distances, attachment viewing for uncached files) say
"available online" rather than erroring.
_Avoid_: error banner (offline is a mode, not a failure)

## Deployment contract

`docs/deployment.md` is the public deployment contract a deploying repository
references (ADR-0020): components, release-tag pinning, build commands, and
required configuration. Environment-specific work items are tracked in the
deploying repository, never here.

The Helm chart in `charts/api` is part of any change that touches runtime
configuration. `charts/api/values.yaml` declares the deployment contract:
non-secret env vars under `config`, required secret keys under `secretKeys`.
A contract test (`apps/api/src/app/config/env-chart-contract.spec.ts`) fails
CI when `EnvSchema` requires an env var the chart does not declare — so a new
required env var means updating the chart, its README, and `.env.example` in
the same change, plus a deploy note when an operator must supply the value.

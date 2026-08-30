# RV Checklist and Maintenance Tracker

This application helps an RV owner who forgets the objects that are out of
sight. The owner misses what the owner cannot see.

The checklists show the out-of-sight objects at the time when they are
necessary. The owner then leaves nothing behind during the packing, and misses
no step in a procedure. An object in full view does not need a checklist. Thus
there is no list for the setup of a campsite.

The maintenance records answer the question "When did I do this task last?" The
application is pull-based. It gives an answer when the owner asks. It never
sends a reminder.

## Language

**Rig**:
An RV that a user owns. Its identifiers are the VIN, the make, the model, the
year, and a nickname. Each checklist, each task, and each log belongs to a rig.
They do not belong directly to a user. A user can own more than one rig.

A rig also holds a current **Distance**. The Distance is the measure that a
distance-based maintenance interval uses. A rig also holds an **Equipment** list
and optional **Dimensions**.

The model does not record the type of the rig. A rig can be towable or
driveable, and nothing in this model assumes one type.
_Avoid_: RV, vehicle, camper

**Distance**:
The full distance that a rig moved, when driven and when towed. It is a running
total in **kilometres**. The owner keeps this value current. When the owner marks
the stops of a **Trip** as arrived, the application updates the value
automatically. Manual entry remains available for corrections.

The Distance is the measure for the distance limit of an **Interval**. A task
that is due "every 20,000 km" compares the current Distance of the rig against
the Distance that the application recorded at the last performance of the task.

A trailer has no odometer. Thus this value is a figure that the owner keeps. It
is not a reading from an instrument.
_Avoid_: mileage, odometer (a towable rig has no odometer), miles (use
kilometres only)

**Dimensions**:
The fixed physical measurements of the rig. The owner records them one time on
the rig. The owner reads them during a trip, to answer questions such as "Can I
drive below this?" and "Can I park here and also extend the slide?"

All the values are optional:

- **travel height**: from the ground to the highest point, in the driving
  configuration.
- **length**: the rig alone.
- **combined length**: the rig and the vehicle that tows it, or the rig and the
  vehicle that it tows. Measure this length when the two are connected. Never
  calculate it as a sum, because the hitch makes an overlap.
- Two **side clearances**: the distance that the slide or the awning extends from
  the wall when fully deployed. One value is for the **passenger side** and one
  value is for the **driver side**.

Each value is the measured figure. No value contains a safety margin. The owner
decides the margin at the time of use.

The metric value is the primary value. The owner enters metric values. The
display shows the metric value first, with the value in feet and inches next to
it. Roadside clearance signs in the US are imperial. The imperial figure always
rounds **up**, because a larger figure for the rig is the safe error.
_Avoid_: height or clearance without a qualifier (say travel height or side
clearance), width (a side clearance is the reach of a deployment, not the width
of the rig), trailer or truck (the model does not record the type of the rig,
and length and combined length apply to a towable rig and to a driveable rig)

**Equipment**:
An item of note on a rig. Examples are a generator, batteries, a solar system,
and a vent fan. The factory can install the item, or a person can add it later.
The model does not record which one occurred. If the origin is important, the
owner puts it in the notes.

The equipment list is a description only. The application calculates nothing
from it. It exists to tell a reader of the rig which items the rig carries. The
primary reader is an AI agent that writes maintenance tasks.

An item has a name. It can also have a make, a model, a **purchase date**,
free-text notes, and a **Cost**. The purchase date is the start point of the
warranty. The delay between the purchase and the installation is small, and the
model does not record it. The notes can hold specifications, the length of the
warranty, and the origin. The Cost is the money that the owner paid to buy the
item and to install it. The Cost is empty for a factory item.

The model does not record the warranty. The purchase date and a note are
sufficient for a reader to judge the status of the warranty.

Maintenance on an item of equipment is an ordinary Maintenance Task. The model
does not track equipment items, does not link them to tasks, and never makes them
due. If the owner removes an item, the application deletes it and keeps no
history.
_Avoid_: upgrade, mod, addition (the origin is not important), accessory, gear
(this word is for the packed belongings), asset

**Checklist**:
An ordered template of the steps of a procedure or of a packing job. The owner
uses it more than one time. Examples are a pre-departure checklist, a
spring-opening checklist, and a packing list.

Its identifier is its name. It can also have free-form tags for organization. A
packing list changes with the length of the trip, so there is no fixed system of
categories.

A checklist is a template. The owner can change it at a later time. A run of a
checklist never changes the checklist.
_Avoid_: checklist template (this is unnecessary, because a checklist is the
template), list, event type (the categories are tags)

**Step**:
One ordered entry in a checklist. A step is an action to do or an item to pack.
The owner does the steps during a run.

Most steps are plain text. Examples are "close roof vents" and "pack the coffee
maker". A step can also refer to a maintenance task, when the completion of that
step is the performance of that maintenance.

A plain step can define its own custom fields. An example is "fresh water level".
When the owner completes the step, the application records the values on the copy
of the step in the run.

A step that links to a task never defines its own fields. Its fields come from
the task.
_Avoid_: item (this word is ambiguous with the packed belongings), task (this
word is for maintenance)

**Step state**:
In a run, each step has one of three states: **incomplete**, **complete**, or
**skipped**. The state is not a boolean value.

The skipped state is an intentional decision to not do the step. The primary
example is a decision to leave an item at home. The skipped state is different
from a step that the owner did not do yet.

Only the *completion* of a step that links to a task records maintenance. A skip
records nothing.
_Avoid_: checked, unchecked, ticked

**Run**:
A dated copy of the steps of a checklist. The application creates the run when
the user starts the checklist for a real occasion. The run holds the state of
each step: incomplete, complete, or skipped.

The run is a copy, because the checklist can change with time. A later change to
the checklist does not change a run from the past.

The application locks nothing. The runs and their answers stay editable, so the
user can always go back and make a correction.

A run can link to a **Trip**, as a convenient group. The user can start the same
checklist any number of times on one trip.
_Avoid_: instance, session, execution, snapshot (a run is a copy, not a record
that stays the same)

**Trip**:
A named journey of a rig. It starts at a start point that the owner sets. The
start point is free text and a Google place reference. It has the same shape as
the location of a stop.

The trip then continues through an ordered sequence of **Stops**. The owner plans
the stops first. The owner then records the stops during the journey. There is
one editable record for the full trip. There is no separate plan and log, and
there is no comparison of the plan against the result.

In the application, the user creates a trip complete. One request holds a start
place from Google and a minimum of one stop. A start point without a place cannot
supply the first leg. A trip without a stop is not a trip.

An older trip can have a start point that is text only, or no stops. The
application continues to show such a trip. But a change to the start point needs
a place from Google, and the user cannot delete the last stop. To remove the last
stop, delete the trip.

A trip goes in one direction. It ends at its last stop. There is no home base. A
return journey is a separate trip. If the owner leaves the rig at a location for
a season, that period is the space between two trips.

A trip belongs to one rig. Checklists connect to trips in a many-to-many
relation, as a convenient group. The user starts a run when the user needs it.
The run links to the trip. A run never links to a stop.

The status of a trip is `planned`, `underway`, or `completed`. The application
calculates the status from the stops that are arrived. It never stores the
status.
_Avoid_: journey, voyage, round trip (each direction is a separate trip),
itinerary, trip type (the difference between a short trip and a long trip comes
from the linked checklists)

**Current trip**:
The one trip that the owner of a rig most probably wants now. It is the
**underway** trip, if one exists. If no trip is underway, it is the **planned**
trip with the earliest start. The start is the arrival date of its first stop.

The application calculates the current trip and never stores it. The current trip
comes from the trip status, and the application also calculates that status.

A rig with no underway trip and no planned trip has no current trip.
_Avoid_: active trip, next trip (the current trip can be underway now)

**Stop**:
One ordered overnight halt on a trip. A stop is a rest on the route or the
destination. The last stop is the end of the trip.

The stop holds all the data for the arrival. Without the stop, the owner must
search for this data in email. All of these values are optional: the campground,
the campsite, the arrival date, the number of nights, the check-in time, the
check-out time, the booking number, the **Cost**, the address, the telephone
number, and free-text notes. The notes can hold a gate code or a wifi password.

The location of a stop is free text with an optional **Google place reference**
(a place ID). There is no place record that the owner can use again. When the
owner selects a place from the autocomplete list, the application can fill in the
address and the telephone number. The owner then controls those values and can
change them.

The stop also holds the **leg**. The leg is the distance in km from the previous
stop, or from the start point of the trip, into this stop.

The application gets the leg from Google Maps when both ends have a place
reference. It does this when the owner adds the stop, when the owner changes the
place at either end, and again when the owner changes the order of the stops or
deletes a stop. The value from Google is rounded to the nearest 5 km. The leg is
always a figure that the owner can edit.

The application never automatically replaces a leg that the owner typed. It also
never automatically replaces the leg of a stop that is arrived. The owner can
always request a new value from Google. If one end has no place reference, the
owner types the value.

When the owner marks a stop as **arrived**, the application adds its leg to the
**Distance** of the rig. If the owner then changes the leg of an arrived stop,
the application changes the rig Distance by the difference.

A stop can also hold **Attachments**.
_Avoid_: waypoint, destination as an entity (the destination is the last stop),
leg as a synonym for stop (a leg is the drive into a stop)

**Attachment**:
A file on a stop. The arrival paperwork is then with the stop and not in email.
An attachment is an image or a PDF. The owner can paste the image from the
clipboard, select it with a file picker, or make it with the camera of the
telephone.

A maximum of one attachment on a stop can have the **campground map** flag. The
campground map is the layout image from the campground. The owner uses it after
the arrival, to find the correct route in the grounds.

The campground map is not the navigation link. The navigation link comes from the
Google place reference of the stop, and it drives the rig *to* the stop. The
campground map shows the owner the way *in* the grounds. These two are always
different.

An attachment belongs to a stop only. An attachment never belongs to a trip. If
the owner deletes a stop, the application deletes its attachments and keeps
nothing.
_Avoid_: photo (this word is for the photo field type in maintenance), document,
campsite map (the map shows the full campground, not one site), upload (this word
is the action, not the object)

**Maintenance Task**:
A job to keep a rig in good condition. An example is "condition slide seals". It
can have a free-text description that tells why the job is necessary and how to
do it. If there is no description, there is no description. It can also have
custom fields that the user defines.

Steps on any number of checklists can refer to a task. The owner can also perform
a task alone.

The application can track the due status of a task in one of two ways. The task
can have an interval, which makes it recurrent. Or the task can be one-time. The
two ways are mutually exclusive. A task can also have no tracking. A task with no
interval and no one-time marker is not tracked.
_Avoid_: job, chore, todo

**Interval**:
The recurrence period on a recurrent maintenance task. An interval carries a
maximum of two **limits**:

- A **calendar** limit. An example is every 12 months.
- A **Distance** limit. An example is every 20,000 km.

A minimum of one limit is present. The interval can omit either limit. The
application ignores an empty limit.

When both limits are present, the task becomes due at the first limit that the
rig reaches. This is the same as a real distance schedule, which reads "every 2
years or 30,000 km, whichever comes first".

The interval as a whole is optional. It is mutually exclusive with the one-time
marker.

The interval drives a passive due status and overdue status. The application
calculates the status on a read. It uses the date on which a person **last
performed** the task. For the distance limit, it also uses the current Distance
of the rig. The application sends no notification.

A task with an event trigger is **not** an interval. Examples of an event trigger
are "before every trip" and "after any wheel removal". Such a task belongs on a
checklist as a Step.

A season is not a limit of its own. A season such as "each fall" is a calendar
limit. Its anchor is the last-performed date.
_Avoid_: schedule (the application schedules nothing), track-by or basis (an
interval is not one of two options, because it can carry both limits), mileage or
hours (the distance is in kilometres, and run-hours are out of scope)

**Last performed**:
The most recent date on which a person did a maintenance task. It is the anchor
from which the application calculates the next due date of a calendar interval.

Usually this date is the date of the newest **Log Entry**. But the owner can set
the date directly, and can do this when there is no Log Entry. The owner then
anchors a task without a log of the work. Examples are a new task, a task
anchored to a season, and a replacement by age that is anchored to a manufacture
date.

When a manual date and a Log Entry both exist, the application uses the **later**
of the two. A real completion always replaces an estimate.

The last-performed date anchors the **calendar** limit only. The distance limit
anchors on a Distance reading in a log only. This rule applies also when the same
interval carries a calendar limit.
_Avoid_: baseline, anchor date (these are internal terms, and the owner sees
"last performed")

**One-time task**:
A maintenance task that the owner sees one time and does one time. Examples are
trim that became loose on the road, a dead battery in the remote control of a
vent fan, and a first-aid kit that needs new items after use.

A one-time task is an ordinary Maintenance Task. It is in the same list, it uses
the same procedure to perform it, and it makes the same log. It has the one-time
marker in place of an interval.

A one-time task is due from the moment of its creation. The application shows it
with the due maintenance and the overdue maintenance until the owner does it.

When the owner performs the task, the application writes a Log Entry, the same as
any other completion. The task then deletes itself. The Log Entry stays as the
permanent record. It holds a copy of the name and the fields, and it continues to
exist after the deletion of the task.

A one-time task is standalone. It never links to a step. Its content is ordinary
editable content, and this includes the custom fields, until the owner completes
it.
_Avoid_: reminder, one-off (this word is for a task with no tracking and no
interval)

**Tags**:
An optional set of short labels on a maintenance task. The owner uses them to
filter and organize the tasks. They do not impose a fixed system of categories.
They use the same idea as the checklist tags. There is no hierarchy and no
predefined vocabulary.

The application stores a tag in **canonical form**. It removes the spaces at the
ends and makes the letters lowercase. Thus "Tires" and "tires" are the same tag.
When the owner adds a tag that has the same canonical form as an existing tag,
the application selects the existing tag. It does not make a second tag.

The application stores the tags on the row of the task as a `text[]` value. This
is correct, because a tag has no data of its own, and no query reads the tags
across more than one rig.

The list filters by one or more selected tags with AND logic. A task must carry
all the selected tags to be in the result.
_Avoid_: category (the tags are flat, not hierarchical), label (this word is for
the text in the user interface)

**Log Entry**:
The record that a person performed a maintenance task on a date.

The Log Entry holds its own copy of the fields of the task, in the condition that
they had at the time of the record, with the recorded values. Thus a later change
to the task does not change the Log Entry.

The Log Entry can also hold:

- The **Distance** reading of the rig in km at that time. This is the anchor from
  which the application calculates the next due date of a distance interval.
- The **Cost** of the work. The owner enters dollars and cents. The application
  stores the value as an integer number of cents in `costCents`, so that the
  totals stay exact.
- A short free-text **Comment** in the `comment` field. It can have more than one
  line, to a maximum of 500 characters. It can hold the findings, an unusual
  observation, or the method that the person used.

A Log Entry stays editable, the same as the other records. The user can correct
an entry from the past.
_Avoid_: completion as a noun for the record, history item

## Offline

The application operates fully with no network. Refer to
[ADR-0028](docs/adr/0028-offline-first-pwa-powersync.md).

Each record that the owner can write online, the owner can also write offline.
The sync is automatic. There is no sync button.

The offline architecture adds these terms:

**Local store**:
The copy of the data of the owner on the device. It is a PowerSync SQLite
database. The user interface always reads from this database, online and offline.
The sync engine keeps the database current. The server continues to hold the
source of truth.
_Avoid_: cache (the local store is the authority for the display, not a copy that
the application can discard), offline database (the application uses it online
also)

**Sync**:
The background exchange that keeps the local store and the server in agreement.
The downloads arrive continuously while the device has a connection. The
application sends the writes in the queue through the API automatically. It does
this when the user opens the application and when the connection returns.

Sync is never an action of the user.
_Avoid_: backup, refresh (this word is for tokens), manual sync (this function
does not exist)

**Newest wins**:
The rule for a collision. When two devices change the same record, the
application keeps the later change. It uses the edit time from the client,
limited to the server time. The server applies this rule.

Delta operations are an exception. An addition to the Distance is a delta
operation, and the application always applies it.

There is no screen for a merge. The run steps merge at the level of the step.
Thus if two devices complete different steps, the application counts both steps.
_Avoid_: conflict resolution UI, merge (nothing merges, except the run steps)

**Pending**:
A write that is offline and in the queue. The most visible example is a **pending
attachment**. The owner captures the attachment offline. The device holds it in
the outbox with a "waiting to upload" badge. The browser uploads it, also when
the application is closed.

A pending object exists only on the device that made it, until the upload
completes.
_Avoid_: draft (a pending object sends itself, but a draft waits for the user),
unsynced (the word for the user is "pending")

**Warming**:
The operation that puts the pages and the attachments of the current trip on the
device before the connection stops. The campground maps go first. The arrival
then operates with no network.

Warming starts when a trip becomes the current trip, when a new attachment
appears on the current trip, and when the user opens the application while
online.
_Avoid_: preload, download manager (the user sees no control for a download)

**Offline fallback page**:
The page that the application shows with no network, when the owner requests a
page that this device never opened. The page says this, and it gives links to the
pages that are on the device.

The application serves each page that the owner opened before from the device.
Such a page looks the same as always.
_Avoid_: error page, not found (the page exists, and only this device has no
copy)

**Offline indicator**:
The signal in the header of the application that tells the owner that the device
is offline. The connection state of the sync engine drives this signal.

Some functions cannot operate offline. These are the place autocomplete, the
automatic leg distances, and the display of an attachment that is not on the
device. These functions show the text "available online". They do not show an
error.
_Avoid_: error banner (offline is a mode, not a failure)

**Sign in to sync banner**:
The banner in the application that appears when the token refresh of the sync
layer cannot authenticate. The sync layer has its own token refresh, because
background sync has no page navigation that can carry the silent refresh of the
edge middleware.

There are two causes:

- There is no usable session. The banner offers One Tap sign-in.
- The session belongs to a different account than the write queue on this device.
  The banner explains the difference. The application never merges a queue into a
  different account.

The offline shell continues to show the local data at all times. This banner
never stops the remainder of the page. The application never forces a sign-out.
_Avoid_: the style of an error banner (this is the same reason as the offline
indicator, because the banner is a call to action, not a failure state)

## Deployment contract

`docs/deployment.md` is the public deployment contract. A repository that deploys
this application refers to that document. Refer to ADR-0020. The contract gives
the components, the release-tag pinning, the build commands, and the necessary
configuration.

Record the work items for a specific environment in the repository that deploys
the application. Never record them in this repository.

The Helm chart in `charts/api` is part of each change that touches the runtime
configuration. `charts/api/values.yaml` declares the deployment contract. The
`config` key holds the environment variables that are not secret. The
`secretKeys` key holds the necessary secret keys.

A contract test at `apps/api/src/app/config/env-chart-contract.spec.ts` fails CI
when `EnvSchema` needs an environment variable that the chart does not declare.
Thus a new necessary environment variable needs three changes in the same commit:
a change to the chart, a change to the README of the chart, and a change to
`.env.example`. If an operator must supply the value, also add a deployment note.

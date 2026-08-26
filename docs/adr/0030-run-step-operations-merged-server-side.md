# 30. Run steps — per-step operations merged server-side, and client-authored Log Entries

Date: 2026-08-23

## Status

Accepted

Amends [ADR-0028](0028-offline-first-pwa-powersync.md): per-record LWW no longer
governs a run's `steps`, which is the one aggregate field it cannot govern
correctly. Amends [ADR-0008](0008-step-custom-fields.md) only in wording — a
task-linked step still defines no fields of its own.

Decided while building issue
[#144](https://github.com/jtoniolo/rv-checklist/issues/144), under the map
[#124](https://github.com/jtoniolo/rv-checklist/issues/124).

## Context

ADR-0028 settled newest-wins as **per-record** last-write-wins: each write
carries the client's edit timestamp, and the write applies only if that stamp is
newer than the record's stored one. Issue #141 built it. It is the right rule for
a rig's nickname, a trip's name, a log entry's date — one record, one edit time,
one winner.

A run's steps are the exception, and the likeliest two-device surface in the
product. A run is a checklist being worked through; a couple breaking camp will
have the phone and the tablet open on the same run, in a campground with no
signal. Under per-record LWW the phone's queued write carries the *whole* steps
array, including its stale opinion about the steps the tablet completed. Whichever
device syncs second wins outright, and the other device's completions are gone.
No conflict is reported, because at record level there is no conflict: one stamp
is simply newer.

Two smaller problems ride along. A task-linked step's completion writes a
maintenance Log Entry, and until now the link from step to entry
(`RunStep.logEntryId`) was strictly server-owned — the API assigned it and
ignored whatever a client sent, which is exactly what kept a forged or stale echo
from duplicating or detaching an entry. Offline, that rule makes due status wrong
for the whole disconnected stretch: the completion cannot record maintenance until
the queue drains, and when it does the entry is dated the day of the drain rather
than the day of the work. And the run's steps live in a single `jsonb` column, so
there is nowhere obvious to put a per-step edit time.

## Decision

### Steps are merged by step id; nothing else about the run changes

A new endpoint, `POST /runs/:id/step-ops`, takes a batch of **step operations**:

```
{ ops: [ { stepId, state?, values?, logEntryId?, editedAt? }, … ] }
```

Each op names one step and is merged into the stored array by `stepId`. Omitted
fields are left alone, so an op that carries only `values` never moves the step's
state. An op naming a step the run does not have is a `400`: a run's steps are
minted at create and membership never changes, so an unknown id is a client bug,
and it must be a 4xx because the offline queue retries 5xx without a cap.

Two devices that touched **different** steps therefore both land, in either
order, because neither request says anything about the other's step. This is the
whole point of the ticket.

`PATCH /runs/:id` stays, and its `steps` array is now merged the same way — each
element is an operation stamped with the request's `X-Edited-At`. A client that
sends the whole array, which is the shape that body was written for, gets exactly
what it always got. `startedOn` has no per-step equivalent and stays per-record
LWW.

### Per-step recency rides inside the jsonb, and the record clock is left alone

Each `RunStep` carries its own `editedAt`, set from the operation's clock reading
and clamped to server time on receipt exactly as the `X-Edited-At` header is. The
same step edited on two devices resolves **newest wins** on those readings;
strictly newer, so two devices claiming the same instant settle on the one that
arrived first rather than flapping. An operation carrying no reading at all is an
authoritative online edit and always applies — the same thing a bare
`Repository.save` means at record level. Run create initialises every step's
clock, so the first operation on a step is already compared against something.

The stamp lives *inside* the step object rather than in a column because the
steps are one `jsonb` column and moving them out is not on the table (below).

The merge is written by `RunRepository.saveStepsIfUnchanged` — a compare-and-set
on the steps array alone, guarded by `steps = <expected>::jsonb`, with the
service re-reading and re-merging when it loses. It neither reads nor moves the
run's `edited_at`. That separation is load-bearing in both directions: a stale
whole-run stamp cannot erase a fresh per-step merge, and a merge cannot bump the
clock that gates `startedOn` and thereby veto an honest re-dating.

### A run's two editable fields are written by two different statements

The corollary, and it is not optional. `started_on` is written by
`RunRepository.saveStartedOn`, which names that one column; nothing edits a run
through a whole-row write any more.

Leaving `edited_at` alone on a step merge is what keeps the two clocks
independent, but it also makes the record gate **blind** to step work: no stamp
moves, so no whole-row write can be turned away for being stale about the steps.
A re-dating that wrote the whole row would ship the `steps` it read at the top of
the request and silently swallow any merge that landed in between — not a stale
re-dating, which the LWW gate does refuse, but a perfectly *fresh* one. Since the
run screen now fires a step operation on every tap, "concurrent with a merge" is
the ordinary case: correcting the date on a second device while someone taps
through the list on the first.

The record clock cannot be taught to see this without re-coupling the two, which
is the thing this ADR exists to break. Writing one column instead is the cheaper
and stronger answer: the steps are simply not part of the statement, so there is
nothing stale to ship. The `startedOn` write keeps per-record LWW exactly as
before — a stale stamp still leaves the date where it was.

### A client may author the Log Entry, and the server checks the link

The offline path for a task-linked completion is: create the Log Entry locally
with a client-generated id (issue #143), set `logEntryId` on the step locally,
and on reconnect post the entry first, then the step op. The server honours the
supplied link instead of writing its own entry, so the entry keeps the date the
work was really done and due status is right through the offline stretch.

`logEntryId` is therefore no longer server-only, which reverses the invariant
that used to keep it safe. Four checks replace it — one for each thing the old
invariant made impossible — and a link failing any of them is **discarded**
rather than rejected: the server then writes its own entry, which is the same
outcome a client that sent nothing would get.

- **The entry must exist.** A named id that resolves to nothing is not a link.
- **It must sit on this run's rig.** The run was already resolved through the
  ownership gate, so matching its rig *is* the ownership check: another owner's
  entry can never match, and the attempt is indistinguishable from a link to
  nothing (ADR-0003).
- **It must name the step's own task.** Without this an owner's own entry could
  be cross-filed onto a different task and corrupt that task's due status.
- **Nothing may already hold it.** An entry some step already links to is not
  adoptable. Without this a client points a second step at the entry the first
  step wrote and then un-completes that second step — and the detach deletes the
  entry, destroying maintenance history and leaving the first step pointing at
  nothing. The check is rig-wide rather than run-wide, because the theft works
  just as well from a different run on the same rig, which is what running the
  same weekly checklist again next week produces. It also needs no forged id:
  two steps of one checklist naming one task (front and rear slide seals) is an
  ordinary shape, and either may claim the other's entry.

An orphaned entry (`taskId` null — a one-time task deleted itself on completion,
issue #28) passes the *task* check on the rig check alone, exactly as
`LogEntryService`'s replay path already does: the entry no longer records which
task it was, so there is nothing else left to match, and the alternative is
losing the link on the one path that cannot be re-derived. That is what makes the
fourth check load-bearing rather than belt-and-braces — for an orphan it is the
only thing left between any task-linked step on the rig and any orphan on it.

Two seams sit under that fourth check, because it is a read followed by a write.
Within one batch nothing is stored yet, so the batch remembers the links it has
already handed out and never gives one entry to two steps. And an un-completion
never deletes an entry another step of the run still points at, so a claim that
slipped through concurrently costs nobody their history: the thief simply
un-completes with the entry left where it was.

A link **already stored** always beats one the client brings, so a replayed
operation adopts the entry the first delivery wrote rather than writing a second.
The idempotency ledger (issue #142) is the other belt, not the only one.

A client-authored entry is adopted as it stands, without re-validating the step's
values against the task's *current* fields. The entry carries its own snapshot,
validated when it was created; re-checking here would reject a completion made
offline under an older field schema — the same reasoning that already makes
`LogEntryService` validate against the entry's snapshot rather than the live task.

### The web client sends its own idempotency key on this one call

`POST /runs/:id/step-ops` is the first client call to send `Idempotency-Key`, one
key minted per dispatch. It is deliberately narrow rather than a client-wide
interceptor: the general offline queue owns the header everywhere else (issue
#147), and this criterion — no duplicate entry on op replay — needs it end to end
now.

## Alternatives considered

- **Move steps into their own table**, one row per step with its own `edited_at`.
  The textbook answer, and rejected on cost: it would break all four local run
  projections in the PowerSync client (which parse the single `steps` text
  column), force edits to the replication publication, the sync rules, and the
  "exactly ten tables" assertions that pin them, and spend a migration — all to
  buy a per-step timestamp that fits inside the jsonb.
- **Keep per-record LWW and merge only on the client.** Rejected by ADR-0028's
  charter: write authority stays in the API, and a client-side merge would have
  to be reimplemented for every future client.
- **Bump the run's record clock on a step merge.** Simpler, and wrong: it lets
  step work veto an honest `startedOn` correction, and re-introduces exactly the
  coupling the ticket exists to break.
- **A merge UI for same-step conflicts.** Rejected by charter — newest wins, no
  exceptions.
- **Trusting the client's `logEntryId` outright.** It is the whole forgery
  surface: an unchecked link could claim another owner's entry, cross-file work
  onto the wrong task, or detach an entry by naming it on a step that never wrote
  it. Each of those is one of the four checks above, in that order — the last of
  them is why the list is four long and not three.
- **Re-dating a run with a whole-row write, and trusting the record clock to
  catch a concurrent merge.** It cannot: the merge leaves `edited_at` where it
  was, by design, so the gate sees nothing to refuse and the fresh re-dating
  carries its stale `steps` straight through. Writing `started_on` alone costs
  one narrow repository method and needs no clock at all.

## Consequences

- `RunStep` grows an optional `editedAt` and stops treating `logEntryId` as
  server-only. Both are additive on the wire; the PowerSync client reads steps as
  opaque JSON and needs no change.
- No migration, no new table, no new column. The `runs.steps` jsonb column and
  the ten synced tables are exactly as they were.
- Per-step merging is finer than per-record LWW, so a stale whole-array `PATCH`
  now loses only the steps it is actually stale about instead of losing outright.
  A `PATCH` that omits a step leaves it alone rather than dropping it — runs have
  no add- or remove-step operation, so nothing depended on the old behaviour.
- MCP is unaffected: its only run tools are reads.
- The pattern transfers. Any aggregate with an embedded collection edited
  concurrently — Aquarify included — can take per-element stamps and a
  compare-and-set on the collection without moving it out of its column.

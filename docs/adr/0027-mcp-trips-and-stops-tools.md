# 27. MCP trips and stops tools

Date: 2026-08-19

## Status

Accepted

Amends ADR-0023 (MCP tool surface).

## Context

The Trip Planner & Logger build (wayfinder map #102, ticket #119) brings
trips and stops to the API (issue #111), and the map's notes decide that
MCP gets **full CRUD mirroring the existing tool shapes** — trip planning
is exactly the long, tedious authoring work ADR-0023 scoped the agent to.
But ADR-0023's accepted roster says "writes on checklists and maintenance
tasks only. No writes to rigs", and the arrival operation writes the
stop's leg onto the rig's Distance (the invariant lives in `StopService`).
The surface needs defining, and the rig-write rule needs amending.

## Decision

- **Eight new tools, one per trips/stops service operation**, thin
  wrappers over `TripService` and `StopService` exactly as ADR-0023
  prescribes. Read (1): `list_trips` (by rig) — a trip read embeds its
  ordered stops and derived status, so no `get_trip`/`list_stops` are
  needed. Writes (7): `create_trip`, `update_trip`, `delete_trip`,
  `add_stop`, `update_stop`, `delete_stop`, `mark_stop_arrived`. The
  roster grows from 15 to 23 tools (10 read, 13 write).
- **ADR-0023 amended, not broken**: the agent still never writes the rig
  directly. `mark_stop_arrived` (and the other stop operations that move
  legs) adjust the rig's Distance **as a service-owned side effect**, the
  same code path the UI uses — the invariant stays in `StopService`, not
  in the tool.
- **`mark_stop_arrived` takes the arrived flag both ways** so an agent
  can undo an arrival; it is idempotent, so a leg is never counted twice.
- **Attachments are metadata-only over MCP** (ADR-0026): trip reads embed
  each stop's attachment metadata (filename, type, size, campground-map
  flag) and nothing else — no upload, no download, no URLs. The read
  shape (`TripRead`/`StopRead`) already carries exactly this, so no
  stripping is needed.
- **Descriptions state what an agent cannot guess** (ADR-0023's rule):
  distances are kilometres; trip status is derived from arrivals and
  never set directly; arrival writes the leg onto the rig's Distance;
  the campground map is not the navigation link; `position` and
  `arrived` are server-owned.

## Alternatives considered

- **Read-only trips over MCP** — rejected by the map's notes: planning a
  trip (naming stops, filling in booking details, adjusting legs) is the
  authoring work the agent exists for.
- **Excluding `mark_stop_arrived` to preserve ADR-0023's no-rig-writes
  rule verbatim** — rejected: without it an agent cannot log a travel
  day, and the Distance write is the service's invariant, not a rig
  write the tool performs.
- **A `reorder_stop` tool** — deferred: reordering is positional
  fiddling, cheap in the UI, and the surface can grow additively later.
- **`get_trip` / `list_stops`** — rejected: `list_trips` returns trips
  whole (stops, status, attachment metadata embedded), matching the
  no-`get_log_entry` reasoning in ADR-0023.

## Consequences

- `McpModule` imports `TripsModule` (which exports both services); the
  tool-count docblock and the `mcpStrategy` version move to `0.3.0`.
- ADR-0023's Status section carries an "Amended by" note; its roster
  wording is historical, this ADR is current for trips and stops.
- An agent can see that a campground map exists but cannot fetch it
  (ADR-0026) — unchanged, revisit if an agent use case appears.
- Adding `reorder_stop` or trip-level composites later is additive.

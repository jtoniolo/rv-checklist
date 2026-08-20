# 25. Google Maps for leg distances

Date: 2026-08-19

## Status

Accepted — amended 2026-08-19 (issue #121): the "fetch on demand only"
bullet became "automatic fetch with manual override"; an explicit
re-fetch action and manual entry remain.

## Context

A **Trip**'s stops each carry a leg distance (km) that feeds the rig's
owner-maintained **Distance** when the stop is marked arrived. Manual km
entry works but is friction. Wayfinder map #102 research (#103) found
Google Maps effectively free at hobby volume (10,000 free calls/month
per SKU): Routes API for driving distances, Places API (New) for
stop-by-name search. The legacy Directions and Distance Matrix APIs are
feature-frozen.

Google's terms constrain storage: place IDs may be stored indefinitely;
computed distances may be cached at most 30 days; place details (names,
addresses, phones) must not be cached at all. A leg distance, however,
is a permanent log record — a strict reading forbids persisting the
computed value.

The owner returns to only a handful of places, so a reusable place
entity was considered and rejected as not worth its weight (#104).

## Decision

- **Adopt Google Maps**: Routes API (`computeRoutes`) for leg
  distances; Places API (New) autocomplete + Place Details for
  location search.
- **No reusable place entity.** A stop stores free text plus an
  optional Google place ID. The trip's starting point has the same
  shape. Autocomplete makes retyping cheap.
- **Pre-fill, then owner-owned.** Maps output only ever *pre-fills*
  editable fields; once the owner accepts or edits a value it is their
  data, stored permanently — equivalent to reading the number off the
  Maps website and typing it in. This applies to the leg distance and
  to address/phone filled from Place Details. Only the place ID is
  stored *as* Google data, which the terms permit indefinitely.
- **Round the fetched leg to the nearest 5 km.** Distance is already an
  owner-maintained estimate (trailers have no odometer); a coarsened
  figure is honestly the owner's estimate, not a stored Google datum.
  Random jitter was rejected: noise derived from Google's number is
  still derived data and buys nothing.
- **Automatic fetch with manual override** (amended by issue #121;
  originally "fetch on demand only" via an explicit action). Whenever a
  stop and its previous end (the previous stop, or the trip's start
  place for the first stop) both carry place IDs, the leg is fetched
  and filled automatically: on stop add, on a place change at either
  end, and recalculated for affected stops on reorder and delete. The
  stop stores the leg's provenance (`legKmManual`): a leg the owner
  typed is never overwritten automatically, and neither is a
  pre-amendment leg of unknown provenance or an arrived stop's leg (a
  log record with rig-Distance side effects). An explicit "fetch
  distance" action remains and always overwrites; manual km entry
  remains the fallback for stops without a place ID (boondocking, a
  friend's driveway), and the UI names exactly which end is missing a
  place when a leg cannot compute.

## Consequences

- The stored leg is never authoritative Google data, so no 30-day
  purge or recompute machinery exists.
- A single-user personal app carries near-zero practical enforcement
  risk; this stance is a considered trade-off, not legal advice.
- API key provisioning (billing, key restrictions, chart `secretKeys`,
  env vars) is tracked separately on map #102.

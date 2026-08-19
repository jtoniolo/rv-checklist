# Research: Google Maps APIs for Trip-Leg Distances

**Date:** 2026-08-19
**Issue:** [#103](https://github.com/jtoniolo/rv-checklist/issues/103)
**Context:** Evaluate Google Maps Platform for computing per-leg driving distances in a single-user, server-side RV trip planner that stores stops and km per leg.

---

## 1. Which API: Routes API vs Legacy Directions API vs Distance Matrix

**Use the Routes API.** It is the current, actively developed replacement for both the legacy Directions API and the legacy Distance Matrix API.

As of March 1, 2025, Google designated the Directions API and Distance Matrix API as **Legacy** services. Legacy status means feature-frozen, no new features, but still functional with at least 12 months' notice before any discontinuation. No shutdown date has been announced. ([Legacy products and features](https://developers.google.com/maps/legacy))

The Routes API provides two endpoints:

- **Compute Routes** -- single origin-to-destination route with optional waypoints. Returns distance and duration per leg. This is what we need. ([Routes API overview](https://developers.google.com/maps/documentation/routes))
- **Compute Route Matrix** -- many-to-many origins/destinations. Not needed for sequential trip legs.

Key advantages of Routes API over legacy Directions API:

- Field masks let you request only the data you need, reducing cost (you pay per SKU tier based on which fields you request). ([Why migrate to Routes API?](https://developers.google.com/maps/documentation/routes/migrate-routes-why))
- Better performance and ETA accuracy.
- Supports toll information, eco-friendly routing, and two-wheel routing.
- Uses HTTP POST with JSON body instead of GET with URL parameters. ([Migration guide](https://developers.google.com/maps/documentation/routes/migrate-routes))

**Recommendation:** Use `computeRoutes` from the Routes API. Do not start with a legacy API.

## 2. Pricing and Free Tier

### March 2025 pricing model change

Effective March 1, 2025, Google replaced the previous $200/month recurring credit with **per-SKU free monthly call caps**. Each Core Services SKU now has its own free tier measured in billable events per month. ([March 2025 changes](https://developers.google.com/maps/billing-and-pricing/march-2025))

### Routes API pricing

Routes API pricing is tiered by feature usage in each request:

| SKU | Trigger | Free calls/month | Price per 1,000 (after free tier) |
|-----|---------|------------------:|----------------------------------:|
| Compute Routes **Essentials** | Basic route, distance, duration only (no traffic) | 10,000 | $5.00 |
| Compute Routes **Pro** | Traffic-aware routing (`TRAFFIC_AWARE` / `TRAFFIC_AWARE_OPTIMAL`) | 5,000 | $10.00 |
| Compute Routes **Enterprise** | Two-wheel routing or other enterprise features | 1,000 | $15.00 |

([Core services pricing list](https://developers.google.com/maps/billing-and-pricing/pricing))

**For our use case** (a handful of route calculations per month, no traffic awareness needed): the **Essentials** tier applies. With 10,000 free calls per month and hobby usage well under 100 calls, the cost is **effectively zero**.

### Places API pricing (for stop search)

| SKU | Free calls/month | Price per 1,000 |
|-----|------------------:|----------------:|
| Autocomplete Requests | 10,000 | $2.83 |
| Place Details Essentials | 10,000 | $5.00 |
| Text Search Essentials (IDs Only) | Unlimited | $0.00 |

([Core services pricing list](https://developers.google.com/maps/billing-and-pricing/pricing))

Autocomplete session pricing: when you pair Autocomplete requests with a Place Details call using a session token, the first 12 autocomplete requests in the session are billed as Autocomplete Requests, remaining ones are free, and the terminating Place Details call is billed at its own SKU. ([Autocomplete session pricing](https://developers.google.com/maps/documentation/places/web-service/session-pricing))

At hobby usage (a few place searches per month), Places API is also effectively free.

## 3. Place Search Options

For letting users pick a stop by name (e.g., "McRae Point Provincial Park"), three options exist:

### Option A: Autocomplete (New) + Place Details (New) -- Recommended

- User types a query, Autocomplete returns suggestions with place IDs.
- On selection, call Place Details with the place ID to get coordinates and formatted address.
- Session tokens group the autocomplete keystrokes + place details call for pricing purposes.
- SKUs: Autocomplete Requests + Place Details Essentials.

### Option B: Text Search (New)

- Single call that returns places matching a text query, with coordinates and details.
- Simpler than autocomplete (no session management) but less interactive.
- SKUs: Text Search Essentials (IDs Only) is free; Text Search Pro/Enterprise cost more if you request additional fields.

### Option C: Geocoding API

- Converts an address string to coordinates.
- Less useful for named places like parks or campgrounds -- better for street addresses.
- 10,000 free calls/month at Essentials tier.

**Recommendation:** Use **Autocomplete + Place Details** for the frontend stop-picker (interactive, good UX). Use **Text Search (IDs Only)** as a fallback for server-side batch lookups if needed.

## 4. API Key Handling

### Key restrictions for server-side use

For a server-side integration (no client-side JavaScript), Google recommends: ([API security best practices](https://developers.google.com/maps/api-security-best-practices))

- **IP address restriction**: Lock the key to the server's public IP address(es) or CIDR subnet. This is the correct restriction type for server-to-server calls. Do not use HTTP referrer restrictions (those are for browser-based keys).
- **API restriction**: Scope the key to only the specific APIs it needs (Routes API, Places API (New), Geocoding API). This prevents misuse if the key is leaked.
- **Separate keys**: Create a separate API key for each application and platform. Do not share keys between client-side and server-side apps.

### Secret storage

- Store the API key in environment variables or a secrets manager -- never in source code or version control. ([API security best practices](https://developers.google.com/maps/api-security-best-practices))
- For our Helm-based deployment: store in a Kubernetes Secret, reference via `secretKeys` in the env-chart values.

### Additional measures

- Enable billing alerts in the Google Cloud Console to catch unexpected usage.
- Consider OAuth 2.0 service account authentication for server-to-server calls as an alternative to API keys (though API keys are simpler for Maps Platform).

## 5. Terms of Service: Caching and Storage Constraints

The Google Maps Platform Terms of Service ([ToS](https://cloud.google.com/maps-platform/terms)) and the Maps Service Specific Terms ([SST](https://cloud.google.com/maps-platform/terms/maps-service-terms)) govern what may be stored.

### General rule: no caching

Section 3.2.3 of the ToS prohibits pre-fetching, indexing, storing, or caching Google Maps Content except as expressly permitted by the Service Specific Terms. ([ToS](https://cloud.google.com/maps-platform/terms), [Optimizing Web Services](https://developers.google.com/maps/optimize-web-services))

### Exception 1: Place IDs may be stored indefinitely

Place IDs are **exempt** from the caching restrictions in Section 3.2.3(b). You can store place ID values indefinitely. Google recommends refreshing place IDs older than 12 months by making a free Place Details request with only the `place_id` field. ([Place IDs](https://developers.google.com/maps/documentation/places/web-service/place-id), [Optimizing Web Services](https://developers.google.com/maps/optimize-web-services))

### Exception 2: 30-day temporary cache for coordinates and distances

The Service Specific Terms permit temporary caching of the following values for **up to 30 consecutive calendar days**, after which they must be deleted:

- Latitude and longitude (`lat`, `lng`)
- Distance
- Duration
- Time
- Estimated time of arrival (ETA)

This applies across Routes API, Directions API (Legacy), Distance Matrix API (Legacy), and Places API. ([Maps Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms))

### What must NOT be stored

- Place names, formatted addresses, ratings, reviews, opening hours, photos, phone numbers, website URLs, or any other place details. These must be fetched live from the API each time they are displayed. ([Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies))
- Route polylines, step-by-step directions, or other content not listed in the 30-day exception.

### What this means for our app

| Data | Storage allowed? | Duration |
|------|------------------|----------|
| Place IDs for saved stops | Yes | Indefinitely (refresh every 12 months) |
| Leg distances (km) | Yes | Up to 30 days, then must re-fetch |
| Leg durations | Yes | Up to 30 days, then must re-fetch |
| Stop coordinates (lat/lng) | Yes | Up to 30 days, then must re-fetch |
| Stop names and addresses | No | Must fetch live each time displayed |
| Route polylines | No | Must not be cached |

**Practical impact:** We can cache computed leg distances for up to 30 days, which is sufficient for trip planning. For stops, store only the place ID; fetch the name, address, and coordinates fresh from Place Details when displaying the trip.

---

## Summary

Google Maps Platform is effectively free at hobby usage levels. The Routes API Compute Routes Essentials SKU provides 10,000 free calls per month at $0 cost. Places API Autocomplete and Place Details each provide 10,000 free calls per month. A single-user RV trip planner computing a handful of routes per month will stay well within these free tiers.

The main constraint is the Terms of Service caching rules: place IDs can be stored forever, but computed distances, durations, and coordinates can only be cached for 30 days. Place names and addresses must not be stored at all -- they must be fetched live. Design the data model to store place IDs as the durable reference and treat everything else as ephemeral.

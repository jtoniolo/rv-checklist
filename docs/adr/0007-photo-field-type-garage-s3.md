# 7. Photo field type, stored in Garage S3

Date: 2026-07-17

## Status

Accepted

Extends the field `type` set in ADR-0004.

## Context

Photos are useful on maintenance records (and, later, on the deferred Problem
entity — the "true record of the RV"). The home lab already runs Garage (S3) and
Immich, so attachment storage costs little to add.

## Decision

- Add **`photo`** to the field type set: `text | note | number | boolean |
  date | photo`.
- A photo field's `value` is an **object key (or list of keys)** in a dedicated
  **Garage S3 bucket** — it sits in the JSONB field model like any other value.
- **Uploads/downloads are proxied through the NestJS API** (S3 SDK), not
  presigned URLs: the browser already reaches the API via the Cloudflare
  tunnel, and proxying keeps Garage entirely internal with zero new network
  exposure. Fine at personal scale.
- Bucket credentials live in Vault (per ADR-0001).

## Alternatives considered

- **Immich as the attachment store** — rejected. Immich is a photo *library*
  with its own asset/album semantics; wiring app attachments into it couples
  maintenance records to Immich's data model and API stability. The app keeps
  its own copies in a dumb object store; personal camera sync to Immich is
  unaffected.
- **Presigned URLs direct to Garage** — rejected for now; requires exposing
  Garage through the tunnel. Proxying is simpler and sufficient.
- **Defer photos entirely** — rejected; with Garage already running the lift is
  small, and `note`-only detail loses real value on maintenance history.

## Consequences

- Log entries can carry photos via their field copies, like any other value.
- Image resizing/thumbnails are not designed here; the app may serve originals
  until that hurts.
- The future Problem entity inherits a ready-made attachment mechanism.

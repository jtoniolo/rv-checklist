# 26. Stop attachments in a shared Garage bucket, API-proxied

Date: 2026-08-19

## Status

Accepted

Extends ADR-0007 (photo field type, Garage S3).

## Context

A **Stop** needs attachments — chiefly a campground map pasted from the
Ontario Parks reservation system (wayfinder map #102, ticket #107, surfaced
by the #105 prototype). ADR-0007 already chose Garage S3 with API-proxied
transfer for photo fields, but nothing is built: no S3 code, no SDK
dependency, and the `photo` field type is still rejected by validation.
Stop attachments arrive first and create the app's attachment
infrastructure.

## Decision

- **Per-stop attachments only** — no trip-level attachments. A stop holds a
  list; at most one attachment is flagged as the **campground map**, the
  target of the dashboard's campground-map link. The flag is on an ordinary
  attachment, not a separate field.
- **Upload sources**: clipboard paste, file picker, phone camera capture.
  **Accepted types**: raster images (JPEG, PNG, WebP, HEIC) and PDF, max
  15 MB per file, no per-stop count limit. Originals only — no thumbnails
  until it hurts (per ADR-0007).
- **One bucket for the whole app.** ADR-0007's "dedicated bucket" means
  dedicated to the app, not per feature; photo fields share it later. One
  credential, one contract surface.
- **Key layout**: `stops/<stopId>/<attachmentId>`. Filename, MIME type,
  size, and the map flag live on the attachment's DB row, never in the key.
  The stop-scoped prefix makes cascade deletion a one-prefix listing.
- **Transfer is API-proxied** (S3 SDK in NestJS), no presigned URLs —
  Garage stays internal, per ADR-0007.
- **Deployment contract**: `S3_ENDPOINT` and `S3_BUCKET` in chart `config`;
  `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` in `secretKeys`. Added to
  `EnvSchema`, `charts/api/values.yaml`, the chart README, and
  `.env.example` in one change (the env-chart contract test enforces this).
  Provisioning is human work in the home lab (ticket #110).
- **Deletion is hard and cascaded**: attachment → its S3 object; stop → its
  attachments; trip → its stops. No soft delete, no retention.
- **MCP sees metadata only**: filename, type, size, map flag on stop reads.
  No upload, no download, no URLs over MCP.

## Alternatives considered

- **Per-feature buckets** — rejected; more credentials and contract surface
  for no isolation the app needs at personal scale.
- **A dedicated `campgroundMap` field on the stop** — rejected; two upload
  paths and two storage paths for what is one attachment with a flag.
- **Trip-level attachments** — deferred; a trip document can live on the
  relevant stop, and trip scope can be added later if that hurts.
- **Presigned URLs** — already rejected in ADR-0007; would expose Garage
  through the tunnel.
- **Soft delete / retention** — rejected; consistent with the rest of the
  app (removing an Equipment item deletes it, no history).

## Consequences

- The build adds the app's first S3 code path; photo fields (ADR-0007)
  inherit a working bucket, credential set, and proxy route.
- The build-issues ticket (#106) is blocked on bucket provisioning (#110).
- MCP agents can see that a campground map exists but cannot fetch it —
  acceptable, revisit if an agent use case appears.

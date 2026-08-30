# 7. The photo field type, stored in Garage S3

Date: 2026-07-17

## Status

Accepted.

This ADR extends the set of field types in ADR-0004.

## Context

A photo is useful on a maintenance record. It will also be useful on the Problem
entity, which we do not build now. That entity is part of the full record of the
RV.

The operator already runs Garage (S3) and Immich. Thus storage for the
attachments costs little.

## Decision

- Add **`photo`** to the set of field types. The set becomes `text`, `note`,
  `number`, `boolean`, `date`, and `photo`.
- The `value` of a photo field is an **object key**, or a list of object keys, in
  a **Garage S3 bucket** that this application uses only. The value is in the
  JSONB field model, the same as each other value.
- **The NestJS API proxies the uploads and the downloads** with the S3 SDK. The
  application does not use presigned URLs. The browser already reaches the API
  through the Cloudflare tunnel. The proxy keeps Garage fully internal and adds
  no new access from the network. This is satisfactory for a personal
  application.
- The credentials of the bucket are in Vault. Refer to ADR-0001.

## Alternatives that we compared

- **Immich as the store for the attachments.** We rejected this alternative.
  Immich is a photo *library*, and it has its own rules for an asset and an
  album. A connection to Immich makes the maintenance records depend on the data
  model of Immich and on the stability of its API.

  The application keeps its own copies in a simple object store. The sync of the
  personal camera to Immich continues without a change.
- **Presigned URLs directly to Garage.** We rejected this alternative now. It
  needs access to Garage through the tunnel. The proxy is more simple and is
  sufficient.
- **No photos at all.** We rejected this alternative. Garage already operates, so
  the work is small. A `note` field alone loses real value in the maintenance
  history.

## Consequences

- A log entry can hold photos in its copies of the fields, the same as each other
  value.
- This ADR does not design a change of the image size and does not design
  thumbnail images. The application can serve the original image until that
  becomes a problem.
- The Problem entity in the future gets a complete mechanism for its attachments.

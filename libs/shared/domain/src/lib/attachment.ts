import { z } from 'zod';
import { IdSchema } from './common.js';

/**
 * MIME types an attachment may carry (ADR-0026): raster images — pasted from
 * the clipboard, picked, or camera-captured — plus PDF. Originals only, no
 * thumbnails until it hurts (ADR-0007).
 */
export const attachmentMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
] as const;
export const AttachmentMimeTypeSchema = z.enum(attachmentMimeTypes);
export type AttachmentMimeType = z.infer<typeof AttachmentMimeTypeSchema>;

/** Per-file size cap (ADR-0026): 15 MB. */
export const maxAttachmentSizeBytes = 15 * 1024 * 1024;

/**
 * An Attachment — a file kept on a stop, so arrival paperwork lives with the
 * stop instead of in email (CONTEXT.md, ADR-0026). This is the metadata only:
 * the bytes live in the app's Garage bucket under
 * `stops/<stopId>/<attachmentId>`, reachable only through the API's proxied
 * download — never in this model, never over MCP.
 *
 * `isCampgroundMap` flags the one attachment used to find the way inside the
 * grounds after arrival — at most one per stop, enforced by the flag
 * operation, and distinct from the navigation link that drives *to* the stop.
 */
export const AttachmentSchema = z.object({
  id: IdSchema,
  stopId: IdSchema,
  filename: z.string().min(1),
  mimeType: AttachmentMimeTypeSchema,
  sizeBytes: z.number().int().positive().max(maxAttachmentSizeBytes),
  isCampgroundMap: z.boolean(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

/**
 * Body of the campground-map flag operation: `true` makes this attachment the
 * stop's campground map, swapping the flag off any other attachment on the
 * stop; `false` leaves the stop with no map. Idempotent.
 */
export const SetCampgroundMapSchema = z.object({
  isCampgroundMap: z.boolean(),
});
export type SetCampgroundMap = z.infer<typeof SetCampgroundMapSchema>;

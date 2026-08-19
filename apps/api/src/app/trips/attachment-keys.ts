import type { Id } from '@rv-checklist/domain';

/**
 * Object key layout (ADR-0026): ids only — filename, MIME type, size, and the
 * map flag live on the attachment's row, never in the key. The stop-scoped
 * prefix makes cascade deletion a one-prefix listing.
 */
export function stopAttachmentPrefix(stopId: Id): string {
  return `stops/${stopId}/`;
}

/** The bucket key of one attachment's bytes: `stops/<stopId>/<attachmentId>`. */
export function attachmentObjectKey(stopId: Id, attachmentId: Id): string {
  return `${stopAttachmentPrefix(stopId)}${attachmentId}`;
}

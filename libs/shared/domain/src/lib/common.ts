import { z } from 'zod';

/** Every entity is identified by a UUID. */
export const IdSchema = z.uuid();
export type Id = z.infer<typeof IdSchema>;

/** A calendar day, e.g. `2026-07-19` — used for the occasions a run or log entry is dated. */
export const IsoDateSchema = z.iso.date();
export type IsoDate = z.infer<typeof IsoDateSchema>;

/**
 * An instant with an explicit offset, e.g. `2026-08-23T12:00:00Z` — the wire shape of a
 * client's clock reading, matching the `X-Edited-At` header contract. Used where a
 * last-write stamp travels in a body rather than a header (ADR-0030: a run step's own
 * stamp, and the stamp on each step operation).
 */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

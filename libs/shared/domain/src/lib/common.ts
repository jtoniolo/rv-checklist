import { z } from 'zod';

/** Every entity is identified by a UUID. */
export const IdSchema = z.uuid();
export type Id = z.infer<typeof IdSchema>;

/** A calendar day, e.g. `2026-07-19` — used for the occasions a run or log entry is dated. */
export const IsoDateSchema = z.iso.date();
export type IsoDate = z.infer<typeof IsoDateSchema>;

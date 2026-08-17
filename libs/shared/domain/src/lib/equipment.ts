import { z } from 'zod';
import { IdSchema, IsoDateSchema } from './common.js';

/**
 * An Equipment Item — purely descriptive inventory on a rig (CONTEXT.md).
 * No link to maintenance tasks, no history on delete. Ownership resolves
 * through the rig, not carried directly on the item (ADR-0003 via ADR-0006).
 *
 * Optional detail fields (issue #80): make, model, purchaseDate (the warranty
 * anchor — YYYY-MM-DD), free-text notes, and costCents (integer cents, the
 * Log Entry Cost pattern from CONTEXT.md).
 */
export const EquipmentItemSchema = z.object({
  id: IdSchema,
  rigId: IdSchema,
  name: z.string().min(1),
  make: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  purchaseDate: IsoDateSchema.optional(),
  notes: z.string().min(1).optional(),
  costCents: z.number().int().nonnegative().optional(),
});
export type EquipmentItem = z.infer<typeof EquipmentItemSchema>;

/** Create body — `id` is assigned by the server. */
export const CreateEquipmentItemSchema = EquipmentItemSchema.omit({ id: true });
export type CreateEquipmentItem = z.infer<typeof CreateEquipmentItemSchema>;

/**
 * Edit body — all mutable fields are optional (omitted = unchanged).
 * Nullable fields can be explicitly set to `null` to clear them,
 * following the UpdateLogEntrySchema pattern (issue #39).
 */
export const UpdateEquipmentItemSchema = z
  .object({
    name: z.string().min(1),
    make: z.string().min(1).nullable(),
    model: z.string().min(1).nullable(),
    purchaseDate: IsoDateSchema.nullable(),
    notes: z.string().min(1).nullable(),
    costCents: z.number().int().nonnegative().nullable(),
  })
  .partial();
export type UpdateEquipmentItem = z.infer<typeof UpdateEquipmentItemSchema>;

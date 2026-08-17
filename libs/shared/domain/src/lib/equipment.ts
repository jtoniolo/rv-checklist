import { z } from 'zod';
import { IdSchema } from './common.js';

/**
 * An Equipment Item — purely descriptive inventory on a rig (CONTEXT.md).
 * No link to maintenance tasks, no history on delete. Ownership resolves
 * through the rig, not carried directly on the item (ADR-0003 via ADR-0006).
 *
 * Name-only in this slice; make/model/purchase-date/notes/cost are a future
 * ticket (#80).
 */
export const EquipmentItemSchema = z.object({
  id: IdSchema,
  rigId: IdSchema,
  name: z.string().min(1),
});
export type EquipmentItem = z.infer<typeof EquipmentItemSchema>;

/** Create body — `id` is assigned by the server. */
export const CreateEquipmentItemSchema = EquipmentItemSchema.omit({ id: true });
export type CreateEquipmentItem = z.infer<typeof CreateEquipmentItemSchema>;

/** Edit body — only the name can change (rig never moves). */
export const UpdateEquipmentItemSchema = z.object({
  name: z.string().min(1).optional(),
});
export type UpdateEquipmentItem = z.infer<typeof UpdateEquipmentItemSchema>;

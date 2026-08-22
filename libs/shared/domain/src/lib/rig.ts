import { z } from 'zod';
import { IdSchema } from './common.js';

/**
 * A Rig — an RV owned by a user (CONTEXT.md). The aggregate root: checklists, tasks and
 * logs belong to a rig, never directly to a user (ADR-0006). Rigs carry `ownerId` for
 * row-level ownership (ADR-0003).
 *
 * Only the `nickname` is required — it is how the owner refers to the rig. VIN, make,
 * model, and year are optional details the owner may not have on hand when adding a rig;
 * an absent one is simply omitted (never a blank string).
 *
 * `distanceKm` is the rig's current **Distance** (CONTEXT.md, issue #32): a whole,
 * non-negative running total of kilometres, owner-maintained — the yardstick a
 * distance-based Interval is measured against. Optional: a brand-new rig may be at
 * 0 km, but an unset Distance is simply absent (a distance task then reads
 * `reading-needed`). Rig type is not modelled, so this is one figure whether the
 * rig is towed or driven.
 *
 * The `…Mm` fields are the rig's **Dimensions** (CONTEXT.md, issue #139): fixed
 * physical measurements as integer millimetres, all optional — travel height,
 * length (the rig alone), combined length (measured hitched, never a sum — the
 * hitch overlaps), and the two side clearances (slide/awning deployment reach
 * from the wall). Measured figures with no safety margin baked in.
 */
export const RigSchema = z.object({
  id: IdSchema,
  ownerId: IdSchema,
  vin: z.string().min(1).optional(),
  make: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  year: z.number().int().gte(1900).lte(2100).optional(),
  nickname: z.string().min(1),
  distanceKm: z.number().int().nonnegative().optional(),
  travelHeightMm: z.number().int().positive().optional(),
  lengthMm: z.number().int().positive().optional(),
  combinedLengthMm: z.number().int().positive().optional(),
  clearancePassengerMm: z.number().int().positive().optional(),
  clearanceDriverMm: z.number().int().positive().optional(),
});
export type Rig = z.infer<typeof RigSchema>;

/** Create body — `id` and `ownerId` are assigned by the server, not the client. */
export const CreateRigSchema = RigSchema.omit({ id: true, ownerId: true });
export type CreateRig = z.infer<typeof CreateRigSchema>;

/**
 * Edit body — any subset of the editable fields. `distanceKm` (issue #32) and
 * the Dimensions fields (issue #139) are additionally nullable: an explicit
 * `null` clears the value, while an omitted key leaves it unchanged — the same
 * removal marker the maintenance-task edit uses for its optional fields.
 */
export const UpdateRigSchema = CreateRigSchema.partial().extend({
  distanceKm: z.number().int().nonnegative().nullable().optional(),
  travelHeightMm: z.number().int().positive().nullable().optional(),
  lengthMm: z.number().int().positive().nullable().optional(),
  combinedLengthMm: z.number().int().positive().nullable().optional(),
  clearancePassengerMm: z.number().int().positive().nullable().optional(),
  clearanceDriverMm: z.number().int().positive().nullable().optional(),
});
export type UpdateRig = z.infer<typeof UpdateRigSchema>;

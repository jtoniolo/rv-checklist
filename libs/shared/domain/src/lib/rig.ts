import { z } from 'zod';
import { IdSchema } from './common.js';

/**
 * A Rig — an RV owned by a user (CONTEXT.md). The aggregate root: checklists, tasks and
 * logs belong to a rig, never directly to a user (ADR-0006). Rigs carry `ownerId` for
 * row-level ownership (ADR-0003).
 */
export const RigSchema = z.object({
  id: IdSchema,
  ownerId: IdSchema,
  vin: z.string().min(1),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().gte(1900).lte(2100),
  nickname: z.string().min(1),
});
export type Rig = z.infer<typeof RigSchema>;

/** Create body — `id` and `ownerId` are assigned by the server, not the client. */
export const CreateRigSchema = RigSchema.omit({ id: true, ownerId: true });
export type CreateRig = z.infer<typeof CreateRigSchema>;

/** Edit body — any subset of the editable fields. */
export const UpdateRigSchema = CreateRigSchema.partial();
export type UpdateRig = z.infer<typeof UpdateRigSchema>;

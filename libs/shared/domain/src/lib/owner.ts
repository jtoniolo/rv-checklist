import { z } from 'zod';
import { IdSchema } from './common.js';

/**
 * An Owner — the authenticated user who owns rigs and everything beneath them
 * (ADR-0003: flat multi-user, row-level ownership). Identity is established by
 * Google SSO (ADR-0002); `id` is the `ownerId` every aggregate is scoped to.
 *
 * This is the public identity shape returned by `GET /me`. Persistence-only
 * details — the Google subject, refresh tokens — stay server-side and never
 * appear in this wire model. `name` and `picture` are optional because Google
 * only supplies them when the relevant profile scopes are granted; an absent
 * field is simply omitted.
 */
export const OwnerSchema = z.object({
  id: IdSchema,
  email: z.email(),
  name: z.string().min(1).optional(),
  picture: z.url().optional(),
});
export type Owner = z.infer<typeof OwnerSchema>;

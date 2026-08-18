import { z } from 'zod';

export const OAuthGrantSchema = z.object({
  id: z.uuid(),
  clientName: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});
export type OAuthGrant = z.infer<typeof OAuthGrantSchema>;

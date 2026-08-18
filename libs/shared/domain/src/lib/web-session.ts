import { z } from 'zod';

export const WebSessionSchema = z.object({
  sessionId: z.uuid(),
  userAgent: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});
export type WebSession = z.infer<typeof WebSessionSchema>;

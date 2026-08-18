import { OAuthGrantSchema } from '@rv-checklist/domain';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const OAuthGrantInternalSchema = z.object({
  id: z.uuid(),
  clientName: z.string(),
  createdAt: z.coerce.date(),
  lastUsedAt: z.coerce.date().nullable(),
});

export class OAuthGrantDto extends createZodDto(OAuthGrantInternalSchema) {}

export class OAuthGrantListDto extends createZodDto(
  z.array(OAuthGrantSchema),
) {}

import { McpTokenCreatedSchema } from '@rv-checklist/domain';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class McpTokenCreatedDto extends createZodDto(McpTokenCreatedSchema) {}

const McpTokenStatusInternalSchema = z.object({
  active: z.boolean(),
  createdAt: z.coerce.date().optional(),
  lastUsedAt: z.coerce.date().optional(),
});

export class McpTokenStatusDto extends createZodDto(
  McpTokenStatusInternalSchema,
) {}

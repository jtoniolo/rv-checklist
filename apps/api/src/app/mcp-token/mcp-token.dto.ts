import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const McpTokenCreatedSchema = z.object({
  token: z.string(),
});

const McpTokenStatusSchema = z.object({
  active: z.boolean(),
  createdAt: z.coerce.date().optional(),
  lastUsedAt: z.coerce.date().optional(),
});

export class McpTokenCreatedDto extends createZodDto(McpTokenCreatedSchema) {}

export class McpTokenStatusDto extends createZodDto(McpTokenStatusSchema) {}

import { z } from 'zod';

/**
 * MCP token wire-format schemas (ADR-0022). The API serializes Date objects
 * to ISO strings in JSON; these schemas describe the shape that travels
 * over the wire, shared by both the API serializer and the client parser.
 */

export const McpTokenCreatedSchema = z.object({
  token: z.string(),
});
export type McpTokenCreated = z.infer<typeof McpTokenCreatedSchema>;

export const McpTokenStatusSchema = z.object({
  active: z.boolean(),
  createdAt: z.string().optional(),
  lastUsedAt: z.string().optional(),
});
export type McpTokenStatus = z.infer<typeof McpTokenStatusSchema>;

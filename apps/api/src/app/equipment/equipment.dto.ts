import {
  CreateEquipmentItemWithIdSchema,
  EquipmentItemSchema,
  UpdateEquipmentItemSchema,
} from '@rv-checklist/domain';
import { createZodDto } from 'nestjs-zod';

/**
 * `POST /equipment` body — the client supplies rigId and name, and may supply
 * the id (issue #143). The HTTP-only schema keeps `id` off the MCP surface.
 */
export class CreateEquipmentItemDto extends createZodDto(
  CreateEquipmentItemWithIdSchema,
) {}

/** `PATCH /equipment/:id` body — all mutable fields optional; `null` clears. */
export class UpdateEquipmentItemDto extends createZodDto(
  UpdateEquipmentItemSchema,
) {}

/** The response shape for every equipment endpoint. */
export class EquipmentItemDto extends createZodDto(EquipmentItemSchema) {}

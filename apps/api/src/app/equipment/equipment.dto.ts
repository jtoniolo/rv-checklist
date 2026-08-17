import {
  CreateEquipmentItemSchema,
  EquipmentItemSchema,
  UpdateEquipmentItemSchema,
} from '@rv-checklist/domain';
import { createZodDto } from 'nestjs-zod';

/** `POST /equipment` body — the client supplies rigId and name; the server owns the id. */
export class CreateEquipmentItemDto extends createZodDto(
  CreateEquipmentItemSchema,
) {}

/** `PATCH /equipment/:id` body — all mutable fields optional; `null` clears. */
export class UpdateEquipmentItemDto extends createZodDto(
  UpdateEquipmentItemSchema,
) {}

/** The response shape for every equipment endpoint. */
export class EquipmentItemDto extends createZodDto(EquipmentItemSchema) {}

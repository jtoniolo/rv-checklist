import {
  CreateRigWithIdSchema,
  EquipmentItemSchema,
  RigSchema,
  UpdateRigSchema,
} from '@rv-checklist/domain';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

/**
 * The rig DTOs (ADR-0009): the shared Zod schemas *are* the DTOs. `createZodDto`
 * wraps each schema as a Nest class so the global `ZodValidationPipe` validates
 * request bodies and `ZodSerializerDto` validates responses — one source of
 * truth for the wire model, no hand-written validators.
 */

/**
 * `POST /rigs` body — the client supplies the fields and, optionally, the id
 * (issue #143); the server owns the ownership. The HTTP-only
 * {@link CreateRigWithIdSchema} keeps `id` off the MCP tool surface, which
 * binds the plain create schema.
 */
export class CreateRigDto extends createZodDto(CreateRigWithIdSchema) {}

/** `PATCH /rigs/:id` body — any subset of the editable fields. */
export class UpdateRigDto extends createZodDto(UpdateRigSchema) {}

/** The response shape for list endpoints. */
export class RigDto extends createZodDto(RigSchema) {}

/**
 * The response shape for `GET /rigs/:id` — the rig plus its equipment items
 * (issue #81). Uses `z.array(EquipmentItemSchema)` so every field the schema
 * carries serializes through; future fields added to the schema flow without
 * changes here.
 */
export class RigDetailDto extends createZodDto(
  RigSchema.extend({ equipment: z.array(EquipmentItemSchema) }),
) {}

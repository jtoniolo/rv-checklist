import {
  CreateRigSchema,
  RigSchema,
  UpdateRigSchema,
} from '@rv-checklist/domain';
import { createZodDto } from 'nestjs-zod';

/**
 * The rig DTOs (ADR-0009): the shared Zod schemas *are* the DTOs. `createZodDto`
 * wraps each schema as a Nest class so the global `ZodValidationPipe` validates
 * request bodies and `ZodSerializerDto` validates responses — one source of
 * truth for the wire model, no hand-written validators.
 */

/** `POST /rigs` body — the client supplies the fields; the server owns id + owner. */
export class CreateRigDto extends createZodDto(CreateRigSchema) {}

/** `PATCH /rigs/:id` body — any subset of the editable fields. */
export class UpdateRigDto extends createZodDto(UpdateRigSchema) {}

/** The response shape for every rig endpoint. */
export class RigDto extends createZodDto(RigSchema) {}

import {
  ChecklistSchema,
  CreateChecklistSchema,
  UpdateChecklistSchema,
} from '@rv-checklist/domain';
import { createZodDto } from 'nestjs-zod';

/**
 * The checklist DTOs (ADR-0009): the shared Zod schemas *are* the DTOs.
 * `createZodDto` wraps each schema as a Nest class so the global
 * `ZodValidationPipe` validates request bodies (including the ADR-0008
 * field-source rule and field-schema uniqueness/type rules, which live in the
 * schema) and `ZodSerializerDto` validates responses — one source of truth for
 * the wire model, no hand-written validators.
 */

/** `POST /checklists` body — the client supplies the fields; the server owns the ids. */
export class CreateChecklistDto extends createZodDto(CreateChecklistSchema) {}

/** `PATCH /checklists/:id` body — any subset; a full `steps` array covers add/edit/reorder/delete. */
export class UpdateChecklistDto extends createZodDto(UpdateChecklistSchema) {}

/** The response shape for every checklist endpoint. */
export class ChecklistDto extends createZodDto(ChecklistSchema) {}

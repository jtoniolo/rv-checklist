import {
  CreateRunWithIdSchema,
  RunSchema,
  RunStepOpsSchema,
  UpdateRunSchema,
} from '@rv-checklist/domain';
import { createZodDto } from 'nestjs-zod';

/**
 * The run DTOs (ADR-0009): the shared Zod schemas *are* the DTOs. `createZodDto`
 * wraps each schema as a Nest class so the global `ZodValidationPipe` validates
 * request bodies (including the ADR-0008 field-source rule and the run's
 * step-state enum, which live in the schema) and `ZodSerializerDto` validates
 * responses — one source of truth for the wire model, no hand-written validators.
 */

/**
 * `POST /runs` body — the client names the checklist and may supply the run's
 * id (issue #143); the server copies the steps and mints their ids (#144). The
 * HTTP-only schema keeps `id` off the MCP surface.
 */
export class CreateRunDto extends createZodDto(CreateRunWithIdSchema) {}

/** `PATCH /runs/:id` body — any subset; a full `steps` array covers state and answers. */
export class UpdateRunDto extends createZodDto(UpdateRunSchema) {}

/**
 * `POST /runs/:id/step-ops` body (ADR-0030, issue #144) — a batch of per-step
 * operations, merged into the run by step id.
 */
export class RunStepOpsDto extends createZodDto(RunStepOpsSchema) {}

/** The response shape for every run endpoint. */
export class RunDto extends createZodDto(RunSchema) {}

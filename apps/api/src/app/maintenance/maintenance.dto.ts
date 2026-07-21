import {
  CreateLogEntrySchema,
  CreateMaintenanceTaskSchema,
  LogEntrySchema,
  MaintenanceTaskSchema,
  UpdateLogEntrySchema,
  UpdateMaintenanceTaskSchema,
} from '@rv-checklist/domain';
import { createZodDto } from 'nestjs-zod';

/**
 * The maintenance DTOs (ADR-0009): the shared Zod schemas *are* the DTOs.
 * `createZodDto` wraps each schema as a Nest class so the global
 * `ZodValidationPipe` validates request bodies (including the ADR-0004 field
 * rules — unique names, `photo` rejected, unit only on number — which live in
 * the schema) and `ZodSerializerDto` validates responses — one source of truth
 * for the wire model, no hand-written validators.
 */

/** `POST /tasks` body. */
export class CreateMaintenanceTaskDto extends createZodDto(
  CreateMaintenanceTaskSchema,
) {}

/** `PATCH /tasks/:id` body — any subset; `interval: null` stops due-tracking. */
export class UpdateMaintenanceTaskDto extends createZodDto(
  UpdateMaintenanceTaskSchema,
) {}

/** The response shape for every task endpoint. */
export class MaintenanceTaskDto extends createZodDto(MaintenanceTaskSchema) {}

/** `POST /log-entries` body — a standalone completion with its field snapshot. */
export class CreateLogEntryDto extends createZodDto(CreateLogEntrySchema) {}

/** `PATCH /log-entries/:id` body — correct a date and/or recorded values. */
export class UpdateLogEntryDto extends createZodDto(UpdateLogEntrySchema) {}

/** The response shape for every log-entry endpoint. */
export class LogEntryDto extends createZodDto(LogEntrySchema) {}

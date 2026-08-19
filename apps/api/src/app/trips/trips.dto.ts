import {
  AttachmentSchema,
  CreateStopSchema,
  CreateTripSchema,
  ReorderStopSchema,
  SetCampgroundMapSchema,
  SetStopArrivedSchema,
  StopReadSchema,
  TripReadSchema,
  UpdateStopSchema,
  UpdateTripSchema,
} from '@rv-checklist/domain';
import { createZodDto } from 'nestjs-zod';

/**
 * The trip and stop DTOs (ADR-0009): the shared Zod schemas *are* the DTOs.
 * `createZodDto` wraps each schema as a Nest class so the global
 * `ZodValidationPipe` validates request bodies and `ZodSerializerDto`
 * validates responses — one source of truth for the wire model, no
 * hand-written validators.
 */

/** `POST /trips` body — the client names the rig and the trip; the server owns the id. */
export class CreateTripDto extends createZodDto(CreateTripSchema) {}

/** `PATCH /trips/:id` body — any subset; `null` clears a start-point field. */
export class UpdateTripDto extends createZodDto(UpdateTripSchema) {}

/** The response shape for every trip endpoint: stops embedded, status derived. */
export class TripDto extends createZodDto(TripReadSchema) {}

/** `POST /stops` body — the server owns id, position (appends), and arrived. */
export class CreateStopDto extends createZodDto(CreateStopSchema) {}

/** `PATCH /stops/:id` body — any subset of the detail fields; `null` clears. */
export class UpdateStopDto extends createZodDto(UpdateStopSchema) {}

/** `POST /stops/:id/arrival` body — the explicit arrive / un-arrive flag. */
export class SetStopArrivedDto extends createZodDto(SetStopArrivedSchema) {}

/** `POST /stops/:id/reorder` body — the stop's new zero-based position. */
export class ReorderStopDto extends createZodDto(ReorderStopSchema) {}

/** The response shape for every stop endpoint: attachment metadata embedded (ADR-0026). */
export class StopDto extends createZodDto(StopReadSchema) {}

/** The response shape for the attachment endpoints — metadata only, never bytes. */
export class AttachmentDto extends createZodDto(AttachmentSchema) {}

/** `POST /attachments/:id/campground-map` body — the explicit flag / unflag. */
export class SetCampgroundMapDto extends createZodDto(SetCampgroundMapSchema) {}

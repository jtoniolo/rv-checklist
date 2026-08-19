import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AttachmentEntity,
  AttachmentRepository,
  ChecklistEntity,
  ChecklistRepository,
  RigEntity,
  RigRepository,
  StopEntity,
  StopRepository,
  TripEntity,
  TripRepository,
  TypeOrmAttachmentRepository,
  TypeOrmChecklistRepository,
  TypeOrmRigRepository,
  TypeOrmStopRepository,
  TypeOrmTripRepository,
} from '@rv-checklist/api-data-access';
import { StorageModule } from '../storage/storage.module.js';
import { AttachmentController } from './attachment.controller.js';
import { AttachmentService } from './attachment.service.js';
import { StopController } from './stop.controller.js';
import { StopService } from './stop.service.js';
import { TripController } from './trip.controller.js';
import { TripService } from './trip.service.js';

/**
 * Trips feature module (issue #111): trips, their stops, and the stops'
 * attachments (ADR-0026, issue #113) travel together — a trip read embeds its
 * stops (each with attachment metadata), the arrival operation lives on the
 * stop, and an attachment is born onto one, so one module owns the three HTTP
 * surfaces (the {@link MaintenanceModule} shape). Binds the trip, stop, and
 * attachment repository ports to their TypeORM implementations, plus
 * {@link RigRepository} (ownership resolves through the rig, ADR-0006, and
 * arrival writes the rig's Distance) and {@link ChecklistRepository} (reads
 * drop dangling checklist ids). {@link StorageModule} supplies the bucket
 * seam for attachment bytes and cascade cleanup. The port bindings are the
 * seam the use-case tests swap for the in-memory doubles.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TripEntity,
      StopEntity,
      AttachmentEntity,
      RigEntity,
      ChecklistEntity,
    ]),
    StorageModule,
  ],
  controllers: [TripController, StopController, AttachmentController],
  providers: [
    TripService,
    StopService,
    AttachmentService,
    { provide: TripRepository, useClass: TypeOrmTripRepository },
    { provide: StopRepository, useClass: TypeOrmStopRepository },
    { provide: AttachmentRepository, useClass: TypeOrmAttachmentRepository },
    { provide: RigRepository, useClass: TypeOrmRigRepository },
    { provide: ChecklistRepository, useClass: TypeOrmChecklistRepository },
  ],
  // The MCP module surfaces trips through these use-cases.
  exports: [TripService, StopService],
})
export class TripsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ChecklistEntity,
  ChecklistRepository,
  RigEntity,
  RigRepository,
  StopEntity,
  StopRepository,
  TripEntity,
  TripRepository,
  TypeOrmChecklistRepository,
  TypeOrmRigRepository,
  TypeOrmStopRepository,
  TypeOrmTripRepository,
} from '@rv-checklist/api-data-access';
import { StopController } from './stop.controller.js';
import { StopService } from './stop.service.js';
import { TripController } from './trip.controller.js';
import { TripService } from './trip.service.js';

/**
 * Trips feature module (issue #111): trips and their stops travel together —
 * a trip read embeds its stops and the arrival operation lives on the stop, so
 * one module owns both HTTP surfaces (the {@link MaintenanceModule} shape).
 * Binds the trip and stop repository ports to their TypeORM implementations,
 * plus {@link RigRepository} (ownership resolves through the rig, ADR-0006,
 * and arrival writes the rig's Distance) and {@link ChecklistRepository}
 * (reads drop dangling checklist ids). The port bindings are the seam the
 * use-case tests swap for the in-memory doubles.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      TripEntity,
      StopEntity,
      RigEntity,
      ChecklistEntity,
    ]),
  ],
  controllers: [TripController, StopController],
  providers: [
    TripService,
    StopService,
    { provide: TripRepository, useClass: TypeOrmTripRepository },
    { provide: StopRepository, useClass: TypeOrmStopRepository },
    { provide: RigRepository, useClass: TypeOrmRigRepository },
    { provide: ChecklistRepository, useClass: TypeOrmChecklistRepository },
  ],
  // The MCP module surfaces trips through these use-cases.
  exports: [TripService, StopService],
})
export class TripsModule {}

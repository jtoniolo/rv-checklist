import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ChecklistEntity,
  ChecklistRepository,
  RigEntity,
  RigRepository,
  RunEntity,
  RunRepository,
  TypeOrmChecklistRepository,
  TypeOrmRigRepository,
  TypeOrmRunRepository,
} from '@rv-checklist/api-data-access';
import { Clock, SystemClock } from '../auth/clock.js';
import { RunController } from './run.controller.js';
import { RunService } from './run.service.js';

/**
 * Run feature module (issue #16). Binds the {@link RunRepository} port to its
 * TypeORM implementation and registers the run's persistence, use-case, and HTTP
 * surface. It also binds {@link ChecklistRepository} (a run copies its steps on
 * creation and is listed by checklist) and {@link RigRepository} (ownership is
 * resolved through the rig, ADR-0006), plus a {@link Clock} to date a run — so
 * all three entities are registered here. The port bindings are the seam the
 * use-case test swaps for the in-memory doubles.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RunEntity, ChecklistEntity, RigEntity])],
  controllers: [RunController],
  providers: [
    RunService,
    { provide: RunRepository, useClass: TypeOrmRunRepository },
    { provide: ChecklistRepository, useClass: TypeOrmChecklistRepository },
    { provide: RigRepository, useClass: TypeOrmRigRepository },
    { provide: Clock, useClass: SystemClock },
  ],
})
export class RunModule {}

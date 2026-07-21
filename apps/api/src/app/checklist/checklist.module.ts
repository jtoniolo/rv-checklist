import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ChecklistEntity,
  ChecklistRepository,
  RigEntity,
  RigRepository,
  TypeOrmChecklistRepository,
  TypeOrmRigRepository,
} from '@rv-checklist/api-data-access';
import { ChecklistController } from './checklist.controller.js';
import { ChecklistService } from './checklist.service.js';

/**
 * Checklist feature module (issue #15). Binds the {@link ChecklistRepository}
 * port to its TypeORM implementation and registers the checklist's persistence,
 * use-case, and HTTP surface. It also binds {@link RigRepository} — the
 * use-case resolves ownership through the checklist's rig (ADR-0006) — so both
 * entities are registered here. The port bindings are the seam the use-case
 * test swaps for the in-memory doubles.
 */
@Module({
  imports: [TypeOrmModule.forFeature([ChecklistEntity, RigEntity])],
  controllers: [ChecklistController],
  providers: [
    ChecklistService,
    { provide: ChecklistRepository, useClass: TypeOrmChecklistRepository },
    { provide: RigRepository, useClass: TypeOrmRigRepository },
  ],
})
export class ChecklistModule {}

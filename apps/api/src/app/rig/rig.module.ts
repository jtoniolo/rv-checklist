import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  RigEntity,
  RigRepository,
  TypeOrmRigRepository,
} from '@rv-checklist/api-data-access';
import { RigController } from './rig.controller.js';
import { RigService } from './rig.service.js';

/**
 * Rig feature module (issue #14). Binds the {@link RigRepository} port to its
 * TypeORM implementation and registers the rig's persistence, use-case, and
 * HTTP surface. The port binding is the seam the use-case test swaps for the
 * in-memory double.
 */
@Module({
  imports: [TypeOrmModule.forFeature([RigEntity])],
  controllers: [RigController],
  providers: [
    RigService,
    { provide: RigRepository, useClass: TypeOrmRigRepository },
  ],
  // The seed loader (issue #19) creates starter content through this use-case.
  exports: [RigService],
})
export class RigModule {}

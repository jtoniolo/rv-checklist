import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  EquipmentItemEntity,
  EquipmentItemRepository,
  RigEntity,
  RigRepository,
  TypeOrmEquipmentItemRepository,
  TypeOrmRigRepository,
} from '@rv-checklist/api-data-access';
import { RigController } from './rig.controller.js';
import { RigService } from './rig.service.js';

/**
 * Rig feature module (issue #14). Binds the {@link RigRepository} port to its
 * TypeORM implementation and registers the rig's persistence, use-case, and
 * HTTP surface. The port binding is the seam the use-case test swaps for the
 * in-memory double. The equipment repository is here because the single-rig
 * read embeds equipment items (issue #81, ADR-0006).
 */
@Module({
  imports: [TypeOrmModule.forFeature([RigEntity, EquipmentItemEntity])],
  controllers: [RigController],
  providers: [
    RigService,
    { provide: RigRepository, useClass: TypeOrmRigRepository },
    {
      provide: EquipmentItemRepository,
      useClass: TypeOrmEquipmentItemRepository,
    },
  ],
  // The seed loader (issue #19) creates starter content through this use-case.
  exports: [RigService],
})
export class RigModule {}

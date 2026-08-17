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
import { EquipmentController } from './equipment.controller.js';
import { EquipmentService } from './equipment.service.js';

/**
 * Equipment feature module (issue #79). Binds the
 * {@link EquipmentItemRepository} port to its TypeORM implementation and
 * registers the equipment item's persistence, use-case, and HTTP surface. It
 * also binds {@link RigRepository} — the use-case resolves ownership through
 * the item's rig (ADR-0006).
 */
@Module({
  imports: [TypeOrmModule.forFeature([EquipmentItemEntity, RigEntity])],
  controllers: [EquipmentController],
  providers: [
    EquipmentService,
    {
      provide: EquipmentItemRepository,
      useClass: TypeOrmEquipmentItemRepository,
    },
    { provide: RigRepository, useClass: TypeOrmRigRepository },
  ],
})
export class EquipmentModule {}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * An equipment item row — descriptive inventory on a rig (CONTEXT.md, issue
 * #79). `rig_id` references `rigs` with CASCADE delete so removing a rig
 * removes its equipment. Indexed because the rig-scoped list read
 * (`listByRig`) filters on it. Ownership resolves through the rig, not
 * carried here (ADR-0003 via ADR-0006).
 */
@Entity({ name: 'equipment_items' })
export class EquipmentItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'rig_id', type: 'uuid' })
  rigId!: string;

  @Column({ type: 'text' })
  name!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

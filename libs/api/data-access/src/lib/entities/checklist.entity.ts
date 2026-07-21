import type { Step } from '@rv-checklist/domain';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A checklist row — a reusable, ordered template of steps for a rig (CONTEXT.md,
 * issue #15). `rig_id` carries the rig membership (ADR-0006) and references
 * `rigs` so a checklist is removed when its rig is; it is indexed because the
 * rig-scoped list read (`listByRig`) filters on it.
 *
 * `tags` and `steps` are stored as JSONB, extending ADR-0004's reasoning: a
 * step is owned by exactly one checklist and always read with it (never a
 * shared, cross-checklist library), so — like a task's `field_schema` — it is
 * embedded, not normalised into its own table. Step order is the array
 * position, so the JSONB array preserves it for free, and a whole-aggregate
 * `save` (the {@link ChecklistRepository} port contract) is a single row write.
 * A step may itself carry a `field_schema` (ADR-0008), which rides along inside
 * the same JSONB. The API maps between this persistence shape and the
 * {@link ChecklistSchema} wire model (ADR-0009).
 */
@Entity({ name: 'checklists' })
export class ChecklistEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'rig_id', type: 'uuid' })
  rigId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  tags!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  steps!: Step[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

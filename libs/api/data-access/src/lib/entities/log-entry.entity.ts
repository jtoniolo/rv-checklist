import type { LoggedField } from '@rv-checklist/domain';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A log-entry row — the dated record that a maintenance task was performed
 * (CONTEXT.md, issue #17). `task_id` names the task ("its log history") and
 * `rig_id` carries the rig membership (ADR-0006); both reference their parent
 * `ON DELETE CASCADE` and are indexed because the list reads (`listByTask`,
 * `listByRig`) filter on them.
 *
 * `fields` is JSONB — the entry's **own snapshot** of the task's field
 * definitions with the recorded values (ADR-0004): owned by and read with
 * exactly one entry, each element a field definition plus its `value`. Because
 * the entry holds its own copy, a later edit to the task never rewrites past
 * entries — that guarantee is structural, held here. The API maps between this
 * persistence shape and the {@link LogEntrySchema} wire model (ADR-0009).
 */
@Entity({ name: 'log_entries' })
export class LogEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'task_id', type: 'uuid' })
  taskId!: string;

  @Index()
  @Column({ name: 'rig_id', type: 'uuid' })
  rigId!: string;

  // A calendar day (IsoDate) — postgres `date` round-trips as a 'YYYY-MM-DD'
  // string, which is exactly the wire shape, so no mapping is needed.
  @Column({ name: 'performed_on', type: 'date' })
  performedOn!: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  fields!: LoggedField[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

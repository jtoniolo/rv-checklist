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
 * `rig_id` carries the rig membership (ADR-0006); both are indexed because the
 * list reads (`listByTask`, `listByRig`) filter on them. `rig_id` references its
 * parent `ON DELETE CASCADE`, but `task_id` is nullable and references its parent
 * `ON DELETE SET NULL` (issue #28): deleting a task must never lose "when did I
 * last do this?", so an entry outlives its task — when the task is gone `task_id`
 * is NULL and the entry stays owned via its `rig_id`, labeled by `task_name`.
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
  @Column({ name: 'task_id', type: 'uuid', nullable: true })
  taskId!: string | null;

  @Index()
  @Column({ name: 'rig_id', type: 'uuid' })
  rigId!: string;

  // The task's name as it was when performed (issue #27) — a snapshotted scalar
  // alongside `fields`, so renaming the task never relabels past entries.
  @Column({ name: 'task_name', type: 'text' })
  taskName!: string;

  // A calendar day (IsoDate) — postgres `date` round-trips as a 'YYYY-MM-DD'
  // string, which is exactly the wire shape, so no mapping is needed.
  @Column({ name: 'performed_on', type: 'date' })
  performedOn!: string;

  // The rig's Distance reading (km) at the time performed (issue #32) — the
  // anchor a distance Interval measures from. Nullable: SQL NULL is no reading,
  // which the repository maps to the domain's `undefined`.
  @Column({ name: 'at_distance_km', type: 'integer', nullable: true })
  distanceKm!: number | null;

  // What the task cost in integer cents (issue #39). Nullable: SQL NULL means
  // no cost was recorded, mapped to `undefined` in the domain.
  @Column({ name: 'cost_cents', type: 'integer', nullable: true })
  costCents!: number | null;

  // A short free-text note about the completion (issue #101) — findings, an
  // observation, the method used. The 500-character cap lives in the domain
  // schema; the column is plain text. Nullable: SQL NULL means no comment,
  // mapped to `undefined` in the domain.
  @Column({ type: 'text', nullable: true })
  comment!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  fields!: LoggedField[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

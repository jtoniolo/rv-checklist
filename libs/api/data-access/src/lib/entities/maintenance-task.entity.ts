import type { FieldSchema } from '@rv-checklist/domain';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A maintenance-task row — a recurring upkeep job on a rig (CONTEXT.md, issue
 * #17). `rig_id` carries the rig membership (ADR-0006), references its parent
 * `ON DELETE CASCADE`, and is indexed because the list read (`listByRig`)
 * filters on it.
 *
 * `interval_basis` + `interval_months`/`interval_km` are the optional Interval
 * flattened to typed columns (ADR-0015 — typed, not JSONB): `interval_basis` is
 * the union discriminant (`'calendar'` or `'distance'`), `interval_months` the
 * calendar count, `interval_km` the distance count (issue #32). A NULL basis
 * means the task is not tracked for due-status (CONTEXT.md) —
 * due/overdue is computed on read (ADR-0005), so no due date is persisted.
 * `one_time` is the one-time marker (issue #29): TRUE means the task is due from
 * creation and deletes itself on completion; it and `interval_months` are
 * mutually exclusive. `last_performed` is the optional manual last-performed
 * anchor (issue #33): a hand-set date for a *calendar* interval, needing no log
 * entry; SQL NULL when the owner set none. It rides only with a calendar
 * interval — the invariant is enforced in the domain schema and API service, not
 * the DB. `description` is the optional free-text why/how (issue
 * #25); SQL NULL means the task has none — no placeholder is ever stored.
 * `field_schema` is the task's own custom-field definitions as JSONB
 * (ADR-0004): embedded owned data, validated by the app, never by the schema.
 * The API maps between this persistence shape and the
 * {@link MaintenanceTaskSchema} wire model (ADR-0009).
 */
@Entity({ name: 'maintenance_tasks' })
export class MaintenanceTaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'rig_id', type: 'uuid' })
  rigId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'interval_basis', type: 'text', nullable: true })
  intervalBasis!: 'calendar' | 'distance' | null;

  @Column({ name: 'interval_months', type: 'int', nullable: true })
  intervalMonths!: number | null;

  @Column({ name: 'interval_km', type: 'int', nullable: true })
  intervalKm!: number | null;

  @Column({ name: 'one_time', type: 'boolean', default: false })
  oneTime!: boolean;

  @Column({ name: 'last_performed', type: 'date', nullable: true })
  lastPerformed!: string | null;

  @Column({ name: 'field_schema', type: 'jsonb', default: () => "'[]'" })
  fieldSchema!: FieldSchema;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

import type { RunStep } from '@rv-checklist/domain';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A run row — a dated copy of a checklist's steps, created when the owner starts
 * working through it for a real occasion (CONTEXT.md, issue #16). `checklist_id`
 * records which checklist it came from (so past runs of a checklist can be
 * listed) and `rig_id` carries the rig membership (ADR-0006); both reference
 * their parent `ON DELETE CASCADE` and are indexed because the list reads
 * (`listByChecklist`, `listByRig`) filter on them.
 *
 * `steps` is the run's **own copy** of the steps as JSONB — the same
 * embedded-owned-data reasoning as a checklist's steps (ADR-0004): a run's steps
 * are owned by and read with exactly one run, their order is the array position,
 * and each carries its per-step `state` and any captured `values`. Because it is
 * a copy, a later edit to the source checklist never alters a past run — that
 * guarantee is structural, held here, not enforced by the use-case. A run step
 * may itself carry a `field_schema` (ADR-0008), which rides inside the same
 * JSONB. The API maps between this persistence shape and the {@link RunSchema}
 * wire model (ADR-0009).
 */
@Entity({ name: 'runs' })
export class RunEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'checklist_id', type: 'uuid' })
  checklistId!: string;

  @Index()
  @Column({ name: 'rig_id', type: 'uuid' })
  rigId!: string;

  // The optional trip link (issue #111) — `ON DELETE SET NULL`, so deleting a
  // trip unlinks its runs, never deletes them. Indexed for the trip-screen read.
  @Index()
  @Column({ name: 'trip_id', type: 'uuid', nullable: true })
  tripId!: string | null;

  // A calendar day (IsoDate) — postgres `date` round-trips as a 'YYYY-MM-DD'
  // string, which is exactly the wire shape, so no mapping is needed.
  @Column({ name: 'started_on', type: 'date' })
  startedOn!: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  steps!: RunStep[];

  // Per-record LWW edit time (ADR-0028, issue #141): the stamp `saveIfNewer`
  // compares against, set from the client's clamped X-Edited-At (server now on
  // a plain save). Distinct from `updatedAt`, which auto-touches on every save
  // and must never gate a write. Persistence-side only — never wire data;
  // PowerSync replicates it straight from the row.
  @Column({ name: 'edited_at', type: 'timestamptz', default: () => 'now()' })
  editedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

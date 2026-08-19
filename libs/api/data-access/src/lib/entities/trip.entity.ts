import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A trip row — a named journey of a rig through ordered stops (CONTEXT.md,
 * issue #111). `rig_id` references `rigs` with CASCADE delete and is indexed
 * because the rig-scoped list read (`listByRig`) filters on it. Ownership
 * resolves through the rig (ADR-0003 via ADR-0006).
 *
 * The starting point is free text plus an optional Google place ID — the same
 * shape as a stop's location; only the place ID is stored as Google data,
 * which the terms permit indefinitely (ADR-0025).
 *
 * `checklist_ids` is the many-to-many checklist grouping denormalized as a
 * `uuid[]` (ADR-0017's reasoning: no metadata on the link, no cross-rig
 * queries). It is deliberately unconstrained — no FK — so deleting a checklist
 * needs no trip rewrite; reads tolerate a dangling id (the service drops ids
 * of since-deleted checklists when returning them).
 */
@Entity({ name: 'trips' })
export class TripEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'rig_id', type: 'uuid' })
  rigId!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'start_location', type: 'text', nullable: true })
  startLocation!: string | null;

  @Column({ name: 'start_place_id', type: 'text', nullable: true })
  startPlaceId!: string | null;

  @Column({
    name: 'checklist_ids',
    type: 'uuid',
    array: true,
    default: () => "'{}'",
  })
  checklistIds!: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

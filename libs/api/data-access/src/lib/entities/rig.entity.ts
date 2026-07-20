import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A rig row — an RV owned by a user (CONTEXT.md), the aggregate root every
 * checklist, task and log hangs off (ADR-0006). `ownerId` carries row-level
 * ownership (ADR-0003) and is indexed because the owner-scoped list read
 * (`listByOwner`) filters on it. Identity fields — VIN, make, model, year — plus
 * a display `nickname` mirror {@link RigSchema} in the shared domain; the API
 * maps between this persistence shape and that wire model (ADR-0009).
 */
@Entity({ name: 'rigs' })
export class RigEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  // Only the nickname is required; VIN, make, model, and year are optional
  // details (RigSchema). TypeORM yields SQL NULL as `null`; the domain speaks
  // `undefined` — the repository maps between them.
  @Column({ type: 'text', nullable: true })
  vin!: string | undefined;

  @Column({ type: 'text', nullable: true })
  make!: string | undefined;

  @Column({ type: 'text', nullable: true })
  model!: string | undefined;

  @Column({ type: 'integer', nullable: true })
  year!: number | undefined;

  @Column({ type: 'text' })
  nickname!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

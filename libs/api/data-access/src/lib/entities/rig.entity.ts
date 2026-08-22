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

  // The rig's current Distance in km (issue #32), owner-maintained — the
  // yardstick a distance Interval measures against. Nullable: SQL NULL is an
  // unset Distance, which the repository maps to the domain's `undefined`.
  @Column({ name: 'distance_km', type: 'integer', nullable: true })
  distanceKm!: number | null;

  // The rig's Dimensions (issue #139): fixed physical measurements as integer
  // millimetres — see RigSchema. Nullable: SQL NULL is an unset measurement,
  // which the repository maps to the domain's `undefined`.
  @Column({ name: 'travel_height_mm', type: 'integer', nullable: true })
  travelHeightMm!: number | null;

  @Column({ name: 'length_mm', type: 'integer', nullable: true })
  lengthMm!: number | null;

  @Column({ name: 'combined_length_mm', type: 'integer', nullable: true })
  combinedLengthMm!: number | null;

  @Column({ name: 'clearance_passenger_mm', type: 'integer', nullable: true })
  clearancePassengerMm!: number | null;

  @Column({ name: 'clearance_driver_mm', type: 'integer', nullable: true })
  clearanceDriverMm!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

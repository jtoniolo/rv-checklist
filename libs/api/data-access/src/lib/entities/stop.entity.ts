import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * A stop row — one ordered overnight halt on a trip (CONTEXT.md, issue #111).
 * A real table, not JSONB embedded on the trip: attachments (ADR-0026) will FK
 * stops and their S3 keys are stop-scoped, so a stop needs a durable row
 * identity. `trip_id` references `trips` with CASCADE delete and is indexed
 * because the trip-scoped list read (`listByTrip`) filters on it.
 *
 * `position` is the stop's order on its trip and `arrived` drives the derived
 * trip status plus the rig-Distance side effects; everything else is an
 * optional detail column, nullable so a bare stop is a valid row. `leg_km` is
 * the owner's own figure however it was first filled (ADR-0025), so it
 * persists indefinitely.
 */
@Entity({ name: 'stops' })
export class StopEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'trip_id', type: 'uuid' })
  tripId!: string;

  // The owning rig, denormalized from the trip (ADR-0028): PowerSync sync-rule
  // queries cannot join, so the per-rig bucket key rides on the row itself.
  // Set on create, immutable after — stops never change trips. Indexed because
  // it is the sync buckets' filter column.
  @Index()
  @Column({ name: 'rig_id', type: 'uuid' })
  rigId!: string;

  @Column({ type: 'int' })
  position!: number;

  @Column({ type: 'boolean', default: false })
  arrived!: boolean;

  @Column({ type: 'text', nullable: true })
  campground!: string | null;

  @Column({ name: 'place_id', type: 'text', nullable: true })
  placeId!: string | null;

  @Column({ type: 'text', nullable: true })
  campsite!: string | null;

  // A calendar day (IsoDate) — postgres `date` round-trips as 'YYYY-MM-DD'.
  @Column({ name: 'arrival_date', type: 'date', nullable: true })
  arrivalDate!: string | null;

  @Column({ type: 'int', nullable: true })
  nights!: number | null;

  @Column({ name: 'check_in_time', type: 'text', nullable: true })
  checkInTime!: string | null;

  @Column({ name: 'check_out_time', type: 'text', nullable: true })
  checkOutTime!: string | null;

  @Column({ name: 'booking_number', type: 'text', nullable: true })
  bookingNumber!: string | null;

  @Column({ name: 'cost_cents', type: 'int', nullable: true })
  costCents!: number | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ type: 'text', nullable: true })
  phone!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'leg_km', type: 'int', nullable: true })
  legKm!: number | null;

  // The leg's provenance (issue #121): true = the owner typed it, false = a
  // maps fetch filled it. NULL = unknown (pre-#121 rows) — treated as manual
  // when a leg exists, so automatic fetches never overwrite it.
  @Column({ name: 'leg_km_manual', type: 'boolean', nullable: true })
  legKmManual!: boolean | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

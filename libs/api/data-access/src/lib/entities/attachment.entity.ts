import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * An attachment row — the metadata of one file kept on a stop (ADR-0026,
 * issue #113). The bytes live in the Garage bucket under
 * `stops/<stopId>/<attachmentId>`; nothing but ids ever lands in the object
 * key, so filename, MIME type, and size are authoritative here. `stop_id`
 * references `stops` with CASCADE delete — the stop-scoped key prefix makes
 * the matching object cleanup a one-prefix listing — and is indexed because
 * stop reads embed the attachment list (`listByStop`).
 */
@Entity({ name: 'attachments' })
export class AttachmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'stop_id', type: 'uuid' })
  stopId!: string;

  // The owning rig, denormalized from the stop's trip (ADR-0028): PowerSync
  // sync-rule queries cannot join, so the per-rig bucket key rides on the row
  // itself. Set on create, immutable after — attachments never change stops.
  // Indexed because it is the sync buckets' filter column.
  @Index()
  @Column({ name: 'rig_id', type: 'uuid' })
  rigId!: string;

  @Column({ type: 'text' })
  filename!: string;

  @Column({ name: 'mime_type', type: 'text' })
  mimeType!: string;

  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes!: number;

  @Column({ name: 'is_campground_map', type: 'boolean', default: false })
  isCampgroundMap!: boolean;

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

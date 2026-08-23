import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * One recorded outcome of a mutating request (issue #142, ADR-0028) — the
 * server half of offline replay safety. The offline queue stamps every queued
 * operation with a client-generated uuid (`Idempotency-Key` header); the first
 * successful execution records its response here, and a replay of the same
 * (user, key) pair returns that recorded outcome instead of re-running the
 * handler. `method` and `path` are stored for debuggability only — dedup
 * matches on the key alone. `responseBody` is NULL for bodiless successes
 * (204). Rows expire by age: `createdAt` is indexed so the retention prune
 * (60 days — comfortably longer than any plausible offline stretch) stays
 * cheap.
 */
@Entity({ name: 'idempotency_keys' })
@Index(['userId', 'key'], { unique: true })
export class IdempotencyKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'key', type: 'uuid' })
  key!: string;

  @Column({ type: 'text' })
  method!: string;

  @Column({ type: 'text' })
  path!: string;

  @Column({ type: 'int' })
  status!: number;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody!: unknown;

  @Index()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

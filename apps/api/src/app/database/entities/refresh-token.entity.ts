import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A refresh token (ADR-0002) — the long-lived credential that keeps the owner
 * signed in for months without re-authenticating. Only the SHA-256 `tokenHash`
 * is stored, never the raw value, so a database leak can't be replayed. Tokens
 * rotate on use: refreshing revokes the presented token (`revokedAt`) and
 * records the id that replaced it (`replacedById`), enforcing single-use. The
 * replacement id also records the rotation chain as groundwork; acting on it —
 * reuse detection, revoking a whole chain when a spent token is replayed — is a
 * later slice. Today a spent or revoked token is simply rejected as invalid.
 *
 * These rows are auth-endpoint credentials, not a resource-server session — the
 * API still validates every call from the bearer JWT alone (ADR-0002).
 */
@Entity({ name: 'refresh_tokens' })
export class RefreshTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'text' })
  tokenHash!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | undefined;

  @Column({ name: 'replaced_by_id', type: 'uuid', nullable: true })
  replacedById!: string | undefined;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

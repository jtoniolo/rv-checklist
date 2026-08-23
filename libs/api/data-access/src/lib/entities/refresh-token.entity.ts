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
 * records the id that replaced it (`replacedById`), enforcing single-use —
 * except within the short reuse interval after rotation (ADR-0028), which
 * lets a client that lost the rotation response try again.
 *
 * Issue #98 adds session tracking: `sessionId` groups a rotation chain so the
 * owner can list and revoke web sessions from the connected-apps page.
 * `userAgent` captures the browser at login; `lastUsedAt` is touched on each
 * refresh. Pre-session rows (NULL `sessionId`) are legacy — they expire
 * naturally.
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

  @Column({ name: 'session_id', type: 'uuid', nullable: true })
  sessionId!: string | undefined;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | undefined;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | undefined;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

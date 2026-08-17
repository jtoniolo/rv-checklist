import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * An MCP bearer token (ADR-0022) — the static credential that authorizes
 * Claude (or any MCP client) to call the MCP endpoint on behalf of the owner.
 * Only the SHA-256 hash of the token is stored; the raw value is shown once at
 * creation and is not retrievable. One active token per user; regenerating
 * atomically revokes the previous one.
 */
@Entity({ name: 'mcp_tokens' })
export class McpTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Index({ unique: true })
  @Column({ name: 'token_hash', type: 'text' })
  tokenHash!: string;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | undefined;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt!: Date | undefined;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}

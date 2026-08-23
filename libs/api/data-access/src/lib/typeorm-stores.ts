import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { McpTokenEntity } from './entities/mcp-token.entity.js';
import { RefreshTokenEntity } from './entities/refresh-token.entity.js';
import { UserEntity } from './entities/user.entity.js';
import {
  McpTokenStore,
  RefreshTokenStore,
  UserStore,
  type CreateRefreshTokenInput,
  type McpTokenRecord,
  type RefreshTokenRecord,
  type UpsertUserInput,
  type UpsertUserResult,
  type UserRecord,
  type WebSessionRecord,
} from './stores.js';

function toUserRecord(entity: UserEntity): UserRecord {
  return {
    id: entity.id,
    googleSub: entity.googleSub,
    email: entity.email,
    // TypeORM yields SQL NULL as `null`; the domain speaks `undefined`.
    name: entity.name ?? undefined,
    picture: entity.picture ?? undefined,
  };
}

function toRefreshRecord(entity: RefreshTokenEntity): RefreshTokenRecord {
  return {
    id: entity.id,
    userId: entity.userId,
    expiresAt: entity.expiresAt,
    revokedAt: entity.revokedAt ?? undefined,
    replacedById: entity.replacedById ?? undefined,
    sessionId: entity.sessionId ?? undefined,
  };
}

/** TypeORM-backed {@link UserStore}. */
@Injectable()
export class TypeOrmUserStore extends UserStore {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
  ) {
    super();
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    const found = await this.repo.findOne({ where: { id } });
    return found ? toUserRecord(found) : undefined;
  }

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const found = await this.repo.findOne({ where: { email } });
    return found ? toUserRecord(found) : undefined;
  }

  async upsertByGoogleSub(input: UpsertUserInput): Promise<UpsertUserResult> {
    const existing = await this.repo.findOne({
      where: { googleSub: input.googleSub },
    });
    const fields = {
      email: input.email,
      name: input.name,
      picture: input.picture,
    };
    const entity = existing
      ? this.repo.merge(existing, fields)
      : this.repo.create({ googleSub: input.googleSub, ...fields });
    return {
      user: toUserRecord(await this.repo.save(entity)),
      created: existing === null,
    };
  }
}

/** TypeORM-backed {@link RefreshTokenStore}. */
@Injectable()
export class TypeOrmRefreshTokenStore extends RefreshTokenStore {
  constructor(
    @InjectRepository(RefreshTokenEntity)
    private readonly repo: Repository<RefreshTokenEntity>,
  ) {
    super();
  }

  async create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord> {
    const saved = await this.repo.save(
      this.repo.create({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        sessionId: input.sessionId,
        userAgent: input.userAgent,
      }),
    );
    return toRefreshRecord(saved);
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | undefined> {
    const found = await this.repo.findOne({ where: { tokenHash } });
    return found ? toRefreshRecord(found) : undefined;
  }

  async revoke(id: string, replacedById: string | undefined): Promise<void> {
    await this.repo.update(id, { revokedAt: new Date(), replacedById });
  }

  async updateLastUsed(id: string): Promise<void> {
    await this.repo.update(id, { lastUsedAt: new Date() });
  }

  async findActiveSessionsByUser(userId: string): Promise<WebSessionRecord[]> {
    interface SessionRow {
      session_id: string;
      user_agent: string | null;
      created_at: string;
      last_used_at: string | null;
    }

    const rows: SessionRow[] = await this.repo.query(
      `SELECT
         rt."session_id",
         (array_agg(rt."user_agent" ORDER BY rt."created_at" ASC))[1] AS "user_agent",
         MIN(rt."created_at") AS "created_at",
         MAX(COALESCE(rt."last_used_at", rt."created_at")) AS "last_used_at"
       FROM "refresh_tokens" rt
       WHERE rt."user_id" = $1
         AND rt."session_id" IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM "refresh_tokens" active
           WHERE active."session_id" = rt."session_id"
             AND active."revoked_at" IS NULL
             AND active."expires_at" > NOW()
         )
       GROUP BY rt."session_id"
       ORDER BY "last_used_at" DESC`,
      [userId],
    );

    return rows.map((r) => ({
      sessionId: r.session_id,
      userAgent: r.user_agent ?? undefined,
      createdAt: new Date(r.created_at),
      lastUsedAt: r.last_used_at ? new Date(r.last_used_at) : undefined,
    }));
  }

  async revokeBySessionId(sessionId: string): Promise<void> {
    await this.repo.update(
      { sessionId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}

function toMcpTokenRecord(entity: McpTokenEntity): McpTokenRecord {
  return {
    id: entity.id,
    userId: entity.userId,
    tokenHash: entity.tokenHash,
    createdAt: entity.createdAt,
    revokedAt: entity.revokedAt ?? undefined,
    lastUsedAt: entity.lastUsedAt ?? undefined,
  };
}

/** TypeORM-backed {@link McpTokenStore}. */
@Injectable()
export class TypeOrmMcpTokenStore extends McpTokenStore {
  constructor(
    @InjectRepository(McpTokenEntity)
    private readonly repo: Repository<McpTokenEntity>,
  ) {
    super();
  }

  async replaceForUser(
    userId: string,
    tokenHash: string,
  ): Promise<McpTokenRecord> {
    return this.repo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(McpTokenEntity);
      await repo.update(
        { userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
      const saved = await repo.save(repo.create({ userId, tokenHash }));
      return toMcpTokenRecord(saved);
    });
  }

  async findActiveByHash(
    tokenHash: string,
  ): Promise<McpTokenRecord | undefined> {
    const found = await this.repo.findOne({
      where: { tokenHash, revokedAt: IsNull() },
    });
    return found ? toMcpTokenRecord(found) : undefined;
  }

  async findActiveByUser(userId: string): Promise<McpTokenRecord | undefined> {
    const found = await this.repo.findOne({
      where: { userId, revokedAt: IsNull() },
    });
    return found ? toMcpTokenRecord(found) : undefined;
  }

  async revokeForUser(userId: string): Promise<void> {
    await this.repo.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }

  async updateLastUsed(id: string): Promise<void> {
    await this.repo.update(id, { lastUsedAt: new Date() });
  }
}

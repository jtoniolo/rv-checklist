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
    // `revokedAt` / `replacedById` are left to their SQL NULL defaults.
    const saved = await this.repo.save(
      this.repo.create({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
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

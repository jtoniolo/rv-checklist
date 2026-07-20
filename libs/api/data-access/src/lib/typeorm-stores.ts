import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshTokenEntity } from './entities/refresh-token.entity.js';
import { UserEntity } from './entities/user.entity.js';
import {
  RefreshTokenStore,
  UserStore,
  type CreateRefreshTokenInput,
  type RefreshTokenRecord,
  type UpsertUserInput,
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

  async upsertByGoogleSub(input: UpsertUserInput): Promise<UserRecord> {
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
    return toUserRecord(await this.repo.save(entity));
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

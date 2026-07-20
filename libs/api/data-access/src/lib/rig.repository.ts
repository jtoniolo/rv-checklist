import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  Id,
  Rig,
  RigRepository as RigRepositoryPort,
} from '@rv-checklist/domain';
import { Repository } from 'typeorm';
import { RigEntity } from './entities/rig.entity.js';

/**
 * The {@link RigRepositoryPort} as a concrete Nest DI token (an abstract class,
 * so it survives type erasure). The use-case in `apps/api` injects this; the
 * module binds it to {@link TypeOrmRigRepository} in production and a test binds
 * it to the in-memory double under `@rv-checklist/domain/testing`. Reads are
 * expressed in domain terms; owner scoping (ADR-0003) is enforced a layer up in
 * the use-case, so no ownership rule is duplicated here.
 */
export abstract class RigRepository implements RigRepositoryPort {
  abstract findById(id: Id): Promise<Rig | undefined>;
  abstract save(rig: Rig): Promise<Rig>;
  abstract delete(id: Id): Promise<void>;
  abstract listByOwner(ownerId: Id): Promise<Rig[]>;
}

/** The persisted row (with its timestamps) narrowed to the {@link Rig} wire model. */
function toRig(entity: RigEntity): Rig {
  return {
    id: entity.id,
    ownerId: entity.ownerId,
    // TypeORM yields SQL NULL as `null`; the domain omits an absent detail.
    vin: entity.vin ?? undefined,
    make: entity.make ?? undefined,
    model: entity.model ?? undefined,
    year: entity.year ?? undefined,
    nickname: entity.nickname,
  };
}

/**
 * TypeORM-backed {@link RigRepository} (ADR-0009). `save` is a whole-aggregate
 * upsert — the use-case assigns the id and hands over a complete {@link Rig} —
 * so a create and an edit are the same write. The persistence shape (timestamps)
 * never leaves this lib.
 */
@Injectable()
export class TypeOrmRigRepository extends RigRepository {
  constructor(
    @InjectRepository(RigEntity)
    private readonly repo: Repository<RigEntity>,
  ) {
    super();
  }

  async findById(id: Id): Promise<Rig | undefined> {
    const found = await this.repo.findOne({ where: { id } });
    return found ? toRig(found) : undefined;
  }

  async save(rig: Rig): Promise<Rig> {
    const saved = await this.repo.save(this.repo.create(rig));
    return toRig(saved);
  }

  async delete(id: Id): Promise<void> {
    await this.repo.delete(id);
  }

  async listByOwner(ownerId: Id): Promise<Rig[]> {
    const rows = await this.repo.find({ where: { ownerId } });
    return rows.map((row) => toRig(row));
  }
}

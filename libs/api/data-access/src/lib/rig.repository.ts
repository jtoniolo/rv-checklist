import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  ConditionalWrite,
  Id,
  Rig,
  RigRepository as RigRepositoryPort,
} from '@rv-checklist/domain';
import { LessThan, Repository } from 'typeorm';
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
  abstract saveIfNewer(
    rig: Rig,
    editedAt: Date,
  ): Promise<ConditionalWrite<Rig>>;
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
    // The rig's current Distance (issue #32) — NULL when unset (CONTEXT.md).
    distanceKm: entity.distanceKm ?? undefined,
    // The rig's Dimensions (issue #139) — each NULL when unmeasured.
    travelHeightMm: entity.travelHeightMm ?? undefined,
    lengthMm: entity.lengthMm ?? undefined,
    combinedLengthMm: entity.combinedLengthMm ?? undefined,
    clearancePassengerMm: entity.clearancePassengerMm ?? undefined,
    clearanceDriverMm: entity.clearanceDriverMm ?? undefined,
  };
}

/** The wire model with its optional measurements flattened to the row's nullable columns. */
function toRow(rig: Rig): Partial<RigEntity> {
  return {
    ...rig,
    // SQL NULL must be written explicitly: `save` skips `undefined` columns,
    // which would leave a cleared value in place (issue #32).
    /* eslint-disable unicorn/no-null */
    distanceKm: rig.distanceKm ?? null,
    travelHeightMm: rig.travelHeightMm ?? null,
    lengthMm: rig.lengthMm ?? null,
    combinedLengthMm: rig.combinedLengthMm ?? null,
    clearancePassengerMm: rig.clearancePassengerMm ?? null,
    clearanceDriverMm: rig.clearanceDriverMm ?? null,
    /* eslint-enable unicorn/no-null */
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
    // A plain save is an authoritative edit "now" — it re-stamps the LWW edit
    // time (issue #141), so a headerless (online) write always wins over any
    // older queued offline stamp.
    const saved = await this.repo.save(
      this.repo.create({ ...toRow(rig), editedAt: new Date() }),
    );
    return toRig(saved);
  }

  async saveIfNewer(rig: Rig, editedAt: Date): Promise<ConditionalWrite<Rig>> {
    // The strictly-newer comparison and the write are one conditional UPDATE
    // (ADR-0028) — no read-compare-write window.
    const { id: _id, ...row } = toRow(rig);
    const result = await this.repo.update(
      { id: rig.id, editedAt: LessThan(editedAt) },
      { ...row, editedAt },
    );
    const current = await this.repo.findOneByOrFail({ id: rig.id });
    return { applied: (result.affected ?? 0) > 0, record: toRig(current) };
  }

  async delete(id: Id): Promise<void> {
    await this.repo.delete(id);
  }

  async listByOwner(ownerId: Id): Promise<Rig[]> {
    const rows = await this.repo.find({ where: { ownerId } });
    return rows.map((row) => toRig(row));
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  ConditionalWrite,
  Id,
  InsertResult,
  StoredStop,
  StopRepository as StopRepositoryPort,
} from '@rv-checklist/domain';
import { LessThan, Repository } from 'typeorm';
import { StopEntity } from './entities/stop.entity.js';
import { isUniqueViolation } from './unique-violation.js';

/**
 * The {@link StopRepositoryPort} as a concrete Nest DI token (an abstract
 * class, so it survives type erasure). The use-case in `apps/api` injects
 * this; the module binds it to {@link TypeOrmStopRepository} in production and
 * a test binds it to the in-memory double under `@rv-checklist/domain/testing`.
 * Ownership resolves through the stop's trip's rig, a layer up (ADR-0003).
 */
export abstract class StopRepository implements StopRepositoryPort {
  abstract findById(id: Id): Promise<StoredStop | undefined>;
  abstract save(stop: StoredStop, editedAt?: Date): Promise<StoredStop>;
  abstract insert(
    stop: StoredStop,
    editedAt?: Date,
  ): Promise<InsertResult<StoredStop>>;
  abstract saveIfNewer(
    stop: StoredStop,
    editedAt: Date,
  ): Promise<ConditionalWrite<StoredStop>>;
  abstract delete(id: Id): Promise<void>;
  abstract listByTrip(tripId: Id): Promise<StoredStop[]>;
}

/** The persisted row (with its timestamps) narrowed to the {@link StoredStop} model. */
function toStop(entity: StopEntity): StoredStop {
  return {
    id: entity.id,
    tripId: entity.tripId,
    rigId: entity.rigId,
    position: entity.position,
    arrived: entity.arrived,
    campground: entity.campground ?? undefined,
    placeId: entity.placeId ?? undefined,
    campsite: entity.campsite ?? undefined,
    arrivalDate: entity.arrivalDate ?? undefined,
    nights: entity.nights ?? undefined,
    checkInTime: entity.checkInTime ?? undefined,
    checkOutTime: entity.checkOutTime ?? undefined,
    bookingNumber: entity.bookingNumber ?? undefined,
    costCents: entity.costCents ?? undefined,
    address: entity.address ?? undefined,
    phone: entity.phone ?? undefined,
    notes: entity.notes ?? undefined,
    legKm: entity.legKm ?? undefined,
    legKmManual: entity.legKmManual ?? undefined,
  };
}

/**
 * The {@link StoredStop} model widened to a persistable row. Exported for the
 * trip repository's atomic create-with-stops (issue #120), which writes stop
 * rows inside the trip's transaction — one row mapping, two writers.
 */
/* eslint-disable unicorn/no-null -- optional wire fields persist as SQL NULL */
export function stopToRow(stop: StoredStop): Partial<StopEntity> {
  return {
    id: stop.id,
    tripId: stop.tripId,
    rigId: stop.rigId,
    position: stop.position,
    arrived: stop.arrived,
    campground: stop.campground ?? null,
    placeId: stop.placeId ?? null,
    campsite: stop.campsite ?? null,
    arrivalDate: stop.arrivalDate ?? null,
    nights: stop.nights ?? null,
    checkInTime: stop.checkInTime ?? null,
    checkOutTime: stop.checkOutTime ?? null,
    bookingNumber: stop.bookingNumber ?? null,
    costCents: stop.costCents ?? null,
    address: stop.address ?? null,
    phone: stop.phone ?? null,
    notes: stop.notes ?? null,
    legKm: stop.legKm ?? null,
    legKmManual: stop.legKmManual ?? null,
  };
}
/* eslint-enable unicorn/no-null */

/**
 * TypeORM-backed {@link StopRepository} (ADR-0009). `save` is a whole-aggregate
 * upsert — the use-case assigns the id and hands over a complete {@link StoredStop}.
 * The persistence shape (timestamps) never leaves this lib.
 */
@Injectable()
export class TypeOrmStopRepository extends StopRepository {
  constructor(
    @InjectRepository(StopEntity)
    private readonly repo: Repository<StopEntity>,
  ) {
    super();
  }

  async findById(id: Id): Promise<StoredStop | undefined> {
    const found = await this.repo.findOne({ where: { id } });
    return found ? toStop(found) : undefined;
  }

  async save(stop: StoredStop, editedAt?: Date): Promise<StoredStop> {
    if (editedAt === undefined) {
      // A plain save re-stamps the LWW edit time (issue #141) — see RigRepository.
      const saved = await this.repo.save(
        this.repo.create({ ...stopToRow(stop), editedAt: new Date() }),
      );
      return toStop(saved);
    }
    // An exempt write carrying the client's clamped stamp: the row lands, then
    // the edit clock moves to max(stored, editedAt) — see RigRepository (issue #143).
    const saved = await this.repo.save(
      this.repo.create({ ...stopToRow(stop) }),
    );
    await this.repo.update(
      { id: stop.id, editedAt: LessThan(editedAt) },
      { editedAt },
    );
    return toStop(saved);
  }

  async insert(
    stop: StoredStop,
    editedAt?: Date,
  ): Promise<InsertResult<StoredStop>> {
    // Insert-then-catch, never check-then-insert — see RigRepository (issue #143).
    try {
      await this.repo.insert({
        ...stopToRow(stop),
        editedAt: editedAt ?? new Date(),
      });
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const existing = await this.repo.findOneByOrFail({ id: stop.id });
      return { created: false, record: toStop(existing) };
    }
    return { created: true, record: stop };
  }

  async saveIfNewer(
    stop: StoredStop,
    editedAt: Date,
  ): Promise<ConditionalWrite<StoredStop>> {
    // The strictly-newer comparison and the write are one conditional UPDATE
    // (ADR-0028) — no read-compare-write window.
    const { id: _id, ...row } = stopToRow(stop);
    const result = await this.repo.update(
      { id: stop.id, editedAt: LessThan(editedAt) },
      { ...row, editedAt },
    );
    const current = await this.repo.findOneByOrFail({ id: stop.id });
    return { applied: (result.affected ?? 0) > 0, record: toStop(current) };
  }

  async delete(id: Id): Promise<void> {
    await this.repo.delete(id);
  }

  async listByTrip(tripId: Id): Promise<StoredStop[]> {
    // Position order — the reading every caller wants (the trip embeds its
    // stops in travel order), matching the in-memory double.
    const rows = await this.repo.find({
      where: { tripId },
      order: { position: 'ASC' },
    });
    return rows.map((row) => toStop(row));
  }
}

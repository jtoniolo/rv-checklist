import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  ConditionalWrite,
  Id,
  StoredStop,
  Trip,
  TripRepository as TripRepositoryPort,
} from '@rv-checklist/domain';
import { LessThan, Repository } from 'typeorm';
import { StopEntity } from './entities/stop.entity.js';
import { TripEntity } from './entities/trip.entity.js';
import { stopToRow } from './stop.repository.js';

/**
 * The {@link TripRepositoryPort} as a concrete Nest DI token (an abstract
 * class, so it survives type erasure). The use-case in `apps/api` injects
 * this; the module binds it to {@link TypeOrmTripRepository} in production and
 * a test binds it to the in-memory double under `@rv-checklist/domain/testing`.
 * A trip's stops live in their own table behind {@link StopRepository} — this
 * repository holds only the trip row; the use-case composes the read shape.
 * Ownership resolves through the rig, not here (ADR-0003 via ADR-0006).
 */
export abstract class TripRepository implements TripRepositoryPort {
  abstract findById(id: Id): Promise<Trip | undefined>;
  abstract save(trip: Trip): Promise<Trip>;
  abstract saveIfNewer(
    trip: Trip,
    editedAt: Date,
  ): Promise<ConditionalWrite<Trip>>;
  abstract delete(id: Id): Promise<void>;
  abstract listByRig(rigId: Id): Promise<Trip[]>;
  abstract createWithStops(trip: Trip, stops: StoredStop[]): Promise<Trip>;
}

/** The persisted row (with its timestamps) narrowed to the {@link Trip} wire model. */
function toTrip(entity: TripEntity): Trip {
  return {
    id: entity.id,
    rigId: entity.rigId,
    name: entity.name,
    startLocation: entity.startLocation ?? undefined,
    startPlaceId: entity.startPlaceId ?? undefined,
    checklistIds: entity.checklistIds,
  };
}

function toRow(trip: Trip): Partial<TripEntity> {
  return {
    id: trip.id,
    rigId: trip.rigId,
    name: trip.name,
    // eslint-disable-next-line unicorn/no-null
    startLocation: trip.startLocation ?? null,
    // eslint-disable-next-line unicorn/no-null
    startPlaceId: trip.startPlaceId ?? null,
    checklistIds: [...trip.checklistIds],
  };
}

/**
 * TypeORM-backed {@link TripRepository} (ADR-0009). `save` is a whole-aggregate
 * upsert — the use-case assigns the id and hands over a complete {@link Trip}.
 * The persistence shape (timestamps) never leaves this lib.
 */
@Injectable()
export class TypeOrmTripRepository extends TripRepository {
  constructor(
    @InjectRepository(TripEntity)
    private readonly repo: Repository<TripEntity>,
  ) {
    super();
  }

  async findById(id: Id): Promise<Trip | undefined> {
    const found = await this.repo.findOne({ where: { id } });
    return found ? toTrip(found) : undefined;
  }

  async save(trip: Trip): Promise<Trip> {
    // A plain save re-stamps the LWW edit time (issue #141) — see RigRepository.
    const saved = await this.repo.save(
      this.repo.create({ ...toRow(trip), editedAt: new Date() }),
    );
    return toTrip(saved);
  }

  async saveIfNewer(
    trip: Trip,
    editedAt: Date,
  ): Promise<ConditionalWrite<Trip>> {
    // The strictly-newer comparison and the write are one conditional UPDATE
    // (ADR-0028) — no read-compare-write window.
    const { id: _id, ...row } = toRow(trip);
    const result = await this.repo.update(
      { id: trip.id, editedAt: LessThan(editedAt) },
      { ...row, editedAt },
    );
    const current = await this.repo.findOneByOrFail({ id: trip.id });
    return { applied: (result.affected ?? 0) > 0, record: toTrip(current) };
  }

  async delete(id: Id): Promise<void> {
    await this.repo.delete(id);
  }

  async listByRig(rigId: Id): Promise<Trip[]> {
    const rows = await this.repo.find({ where: { rigId } });
    return rows.map((row) => toTrip(row));
  }

  async createWithStops(trip: Trip, stops: StoredStop[]): Promise<Trip> {
    // One transaction (issue #120): stops carry a trip FK, so the trip row is
    // written first and everything rolls back together — a mid-save failure
    // can never strand a stopless trip.
    return this.repo.manager.transaction(async (manager) => {
      const tripRepo = manager.getRepository(TripEntity);
      const stopRepo = manager.getRepository(StopEntity);
      const saved = await tripRepo.save(tripRepo.create(toRow(trip)));
      for (const stop of stops) {
        await stopRepo.save(stopRepo.create(stopToRow(stop)));
      }
      return toTrip(saved);
    });
  }
}

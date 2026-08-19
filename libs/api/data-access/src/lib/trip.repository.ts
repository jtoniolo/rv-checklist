import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  Id,
  Trip,
  TripRepository as TripRepositoryPort,
} from '@rv-checklist/domain';
import { Repository } from 'typeorm';
import { TripEntity } from './entities/trip.entity.js';

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
  abstract delete(id: Id): Promise<void>;
  abstract listByRig(rigId: Id): Promise<Trip[]>;
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
    const saved = await this.repo.save(this.repo.create(toRow(trip)));
    return toTrip(saved);
  }

  async delete(id: Id): Promise<void> {
    await this.repo.delete(id);
  }

  async listByRig(rigId: Id): Promise<Trip[]> {
    const rows = await this.repo.find({ where: { rigId } });
    return rows.map((row) => toTrip(row));
  }
}

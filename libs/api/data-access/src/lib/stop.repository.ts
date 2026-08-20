import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  Id,
  Stop,
  StopRepository as StopRepositoryPort,
} from '@rv-checklist/domain';
import { Repository } from 'typeorm';
import { StopEntity } from './entities/stop.entity.js';

/**
 * The {@link StopRepositoryPort} as a concrete Nest DI token (an abstract
 * class, so it survives type erasure). The use-case in `apps/api` injects
 * this; the module binds it to {@link TypeOrmStopRepository} in production and
 * a test binds it to the in-memory double under `@rv-checklist/domain/testing`.
 * Ownership resolves through the stop's trip's rig, a layer up (ADR-0003).
 */
export abstract class StopRepository implements StopRepositoryPort {
  abstract findById(id: Id): Promise<Stop | undefined>;
  abstract save(stop: Stop): Promise<Stop>;
  abstract delete(id: Id): Promise<void>;
  abstract listByTrip(tripId: Id): Promise<Stop[]>;
}

/** The persisted row (with its timestamps) narrowed to the {@link Stop} wire model. */
function toStop(entity: StopEntity): Stop {
  return {
    id: entity.id,
    tripId: entity.tripId,
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

/* eslint-disable unicorn/no-null -- optional wire fields persist as SQL NULL */
function toRow(stop: Stop): Partial<StopEntity> {
  return {
    id: stop.id,
    tripId: stop.tripId,
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
 * upsert — the use-case assigns the id and hands over a complete {@link Stop}.
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

  async findById(id: Id): Promise<Stop | undefined> {
    const found = await this.repo.findOne({ where: { id } });
    return found ? toStop(found) : undefined;
  }

  async save(stop: Stop): Promise<Stop> {
    const saved = await this.repo.save(this.repo.create(toRow(stop)));
    return toStop(saved);
  }

  async delete(id: Id): Promise<void> {
    await this.repo.delete(id);
  }

  async listByTrip(tripId: Id): Promise<Stop[]> {
    // Position order — the reading every caller wants (the trip embeds its
    // stops in travel order), matching the in-memory double.
    const rows = await this.repo.find({
      where: { tripId },
      order: { position: 'ASC' },
    });
    return rows.map((row) => toStop(row));
  }
}

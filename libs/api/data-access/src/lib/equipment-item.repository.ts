import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  EquipmentItem,
  EquipmentItemRepository as EquipmentItemRepositoryPort,
  Id,
} from '@rv-checklist/domain';
import { Repository } from 'typeorm';
import { EquipmentItemEntity } from './entities/equipment-item.entity.js';

/**
 * The {@link EquipmentItemRepositoryPort} as a concrete Nest DI token (an
 * abstract class, so it survives type erasure). The use-case in `apps/api`
 * injects this; the module binds it to {@link TypeOrmEquipmentItemRepository}
 * in production and a test binds it to the in-memory double under
 * `@rv-checklist/domain/testing`. Ownership resolves through the rig, not
 * here (ADR-0003 via ADR-0006).
 */
export abstract class EquipmentItemRepository implements EquipmentItemRepositoryPort {
  abstract findById(id: Id): Promise<EquipmentItem | undefined>;
  abstract save(item: EquipmentItem): Promise<EquipmentItem>;
  abstract delete(id: Id): Promise<void>;
  abstract listByRig(rigId: Id): Promise<EquipmentItem[]>;
}

function toEquipmentItem(entity: EquipmentItemEntity): EquipmentItem {
  return {
    id: entity.id,
    rigId: entity.rigId,
    name: entity.name,
    make: entity.make ?? undefined,
    model: entity.model ?? undefined,
    purchaseDate: entity.purchaseDate ?? undefined,
    notes: entity.notes ?? undefined,
    costCents: entity.costCents ?? undefined,
  };
}

function toRow(item: EquipmentItem): Partial<EquipmentItemEntity> {
  return {
    id: item.id,
    rigId: item.rigId,
    name: item.name,
    // eslint-disable-next-line unicorn/no-null
    make: item.make ?? null,
    // eslint-disable-next-line unicorn/no-null
    model: item.model ?? null,
    // eslint-disable-next-line unicorn/no-null
    purchaseDate: item.purchaseDate ?? null,
    // eslint-disable-next-line unicorn/no-null
    notes: item.notes ?? null,
    // eslint-disable-next-line unicorn/no-null
    costCents: item.costCents ?? null,
  };
}

/**
 * TypeORM-backed {@link EquipmentItemRepository} (ADR-0009). `save` is a
 * whole-aggregate upsert — the use-case assigns the id and hands over a
 * complete {@link EquipmentItem}. The persistence shape (timestamps) never
 * leaves this lib.
 */
@Injectable()
export class TypeOrmEquipmentItemRepository extends EquipmentItemRepository {
  constructor(
    @InjectRepository(EquipmentItemEntity)
    private readonly repo: Repository<EquipmentItemEntity>,
  ) {
    super();
  }

  async findById(id: Id): Promise<EquipmentItem | undefined> {
    const found = await this.repo.findOne({ where: { id } });
    return found ? toEquipmentItem(found) : undefined;
  }

  async save(item: EquipmentItem): Promise<EquipmentItem> {
    const saved = await this.repo.save(this.repo.create(toRow(item)));
    return toEquipmentItem(saved);
  }

  async delete(id: Id): Promise<void> {
    await this.repo.delete(id);
  }

  async listByRig(rigId: Id): Promise<EquipmentItem[]> {
    const rows = await this.repo.find({ where: { rigId } });
    return rows.map((row) => toEquipmentItem(row));
  }
}

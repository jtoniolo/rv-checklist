import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  EquipmentItemRepository,
  ownedOrUndefined,
  RigRepository,
} from '@rv-checklist/api-data-access';
import type {
  CreateEquipmentItem,
  EquipmentItem,
  Id,
  UpdateEquipmentItem,
} from '@rv-checklist/domain';

/**
 * Equipment item authoring, owner-scoped (issue #79). An equipment item
 * belongs to a rig, not directly to an owner (ADR-0006), so ownership
 * (ADR-0003) is enforced *via the rig*: every operation resolves the item's
 * rig through {@link ownedOrUndefined}, so one owner can never see, edit, or
 * delete equipment on another's rig.
 */
@Injectable()
export class EquipmentService {
  constructor(
    private readonly items: EquipmentItemRepository,
    private readonly rigs: RigRepository,
  ) {}

  private async ownsRig(ownerId: Id, rigId: Id): Promise<boolean> {
    return (
      ownedOrUndefined(await this.rigs.findById(rigId), ownerId) !== undefined
    );
  }

  private async assertOwnsRig(ownerId: Id, rigId: Id): Promise<void> {
    if (!(await this.ownsRig(ownerId, rigId))) {
      throw new NotFoundException('Rig not found');
    }
  }

  async create(
    ownerId: Id,
    input: CreateEquipmentItem,
  ): Promise<EquipmentItem> {
    await this.assertOwnsRig(ownerId, input.rigId);
    return this.items.save({
      id: randomUUID(),
      rigId: input.rigId,
      name: input.name,
    });
  }

  async list(ownerId: Id, rigId: Id): Promise<EquipmentItem[]> {
    await this.assertOwnsRig(ownerId, rigId);
    return this.items.listByRig(rigId);
  }

  async get(ownerId: Id, id: Id): Promise<EquipmentItem> {
    const item = await this.items.findById(id);
    if (item && (await this.ownsRig(ownerId, item.rigId))) {
      return item;
    }
    throw new NotFoundException('Equipment item not found');
  }

  async update(
    ownerId: Id,
    id: Id,
    changes: UpdateEquipmentItem,
  ): Promise<EquipmentItem> {
    const existing = await this.get(ownerId, id);
    return this.items.save({
      ...existing,
      ...(changes.name !== undefined && { name: changes.name }),
    });
  }

  async remove(ownerId: Id, id: Id): Promise<void> {
    const item = await this.get(ownerId, id);
    await this.items.delete(item.id);
  }
}

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
      ...input,
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
    editedAt?: Date,
  ): Promise<EquipmentItem> {
    const next: EquipmentItem = { ...(await this.get(ownerId, id)) };
    if (changes.name !== undefined) next.name = changes.name;
    if (changes.make === null) next.make = undefined;
    else if (changes.make !== undefined) next.make = changes.make;
    if (changes.model === null) next.model = undefined;
    else if (changes.model !== undefined) next.model = changes.model;
    if (changes.purchaseDate === null) next.purchaseDate = undefined;
    else if (changes.purchaseDate !== undefined)
      next.purchaseDate = changes.purchaseDate;
    if (changes.notes === null) next.notes = undefined;
    else if (changes.notes !== undefined) next.notes = changes.notes;
    if (changes.costCents === null) next.costCents = undefined;
    else if (changes.costCents !== undefined)
      next.costCents = changes.costCents;
    if (editedAt === undefined) {
      return this.items.save(next);
    }
    // Per-record LWW (ADR-0028, issue #141): a stale stamp no-ops to the
    // current record.
    const { record } = await this.items.saveIfNewer(next, editedAt);
    return record;
  }

  async remove(ownerId: Id, id: Id): Promise<void> {
    const item = await this.get(ownerId, id);
    await this.items.delete(item.id);
  }
}

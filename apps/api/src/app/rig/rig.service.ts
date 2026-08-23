import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  EquipmentItemRepository,
  ownedOrUndefined,
  RigRepository,
} from '@rv-checklist/api-data-access';
import type {
  CreateRigWithId,
  EquipmentItem,
  Id,
  Rig,
  UpdateRig,
} from '@rv-checklist/domain';
import { adoptCreated } from '../common/adopt-created.js';

/**
 * Apply the *present* fields of a partial edit onto a complete aggregate. A key
 * the client omitted (arriving as `undefined`) leaves the existing value in
 * place rather than overwriting it with a gap — so a PATCH is a true partial
 * edit, and the result stays a complete, typed aggregate.
 */
function applyDefined<T extends object>(
  base: T,
  changes: { readonly [K in keyof T]?: T[K] | undefined },
): T {
  const result: T = { ...base };
  for (const key of Object.keys(changes) as (keyof T)[]) {
    const value = changes[key];
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Rig CRUD, owner-scoped (issue #14). The use-case that owns the row-level
 * ownership rule (ADR-0003): every read of an existing rig runs through
 * {@link ownedOrUndefined}, so one owner can never see, edit, or delete
 * another's rig — a foreign id is indistinguishable from "not found". It holds
 * no HTTP or persistence detail: it depends only on the {@link RigRepository}
 * port, so the whole guarantee is exercised in a unit test with no database.
 */
@Injectable()
export class RigService {
  constructor(
    private readonly rigs: RigRepository,
    private readonly equipmentItems: EquipmentItemRepository,
  ) {}

  private async findOwned(ownerId: Id, id: Id): Promise<Rig> {
    const rig = ownedOrUndefined(await this.rigs.findById(id), ownerId);
    if (!rig) {
      throw new NotFoundException('Rig not found');
    }
    return rig;
  }

  /**
   * Add a rig for the owner — the server assigns the ownership, and the id
   * unless the client brought its own (issue #143). `X-Edited-At` initialises
   * the row's LWW edit time, so a create replayed at reconnect does not stamp
   * itself later than the edits already queued behind it.
   */
  async create(
    ownerId: Id,
    input: CreateRigWithId,
    editedAt?: Date,
  ): Promise<Rig> {
    const { id = randomUUID(), ...fields } = input;
    return adoptCreated(
      await this.rigs.insert({ id, ownerId, ...fields }, editedAt),
      (rig) => rig.ownerId === ownerId,
      'Rig not found',
    );
  }

  /** The owner's rigs. */
  list(ownerId: Id): Promise<Rig[]> {
    return this.rigs.listByOwner(ownerId);
  }

  /**
   * One of the owner's rigs with its equipment items (issue #81, ADR-0006), or
   * `NotFound` if it is missing or another's.
   */
  async get(
    ownerId: Id,
    id: Id,
  ): Promise<Rig & { equipment: EquipmentItem[] }> {
    const rig = await this.findOwned(ownerId, id);
    const equipment = await this.equipmentItems.listByRig(id);
    return { ...rig, equipment };
  }

  /**
   * Apply a partial edit to one of the owner's rigs. `distanceKm` (issue #32)
   * and the Dimensions fields (issue #139) carry the removal marker the other
   * optional fields lack: an explicit `null` clears the value, an omitted key
   * leaves it unchanged. A manual `distanceKm` set rides in the record write,
   * so it is absolute LWW like every other field (ADR-0028) — only the stop
   * operations' delta arithmetic is exempt.
   */
  async update(
    ownerId: Id,
    id: Id,
    changes: UpdateRig,
    editedAt?: Date,
  ): Promise<Rig> {
    const rig = await this.findOwned(ownerId, id);
    const {
      distanceKm,
      travelHeightMm,
      lengthMm,
      combinedLengthMm,
      clearancePassengerMm,
      clearanceDriverMm,
      ...rest
    } = changes;
    const next = applyDefined(rig, rest);
    if (distanceKm === null) {
      delete next.distanceKm;
    } else if (distanceKm !== undefined) {
      next.distanceKm = distanceKm;
    }
    if (travelHeightMm === null) {
      delete next.travelHeightMm;
    } else if (travelHeightMm !== undefined) {
      next.travelHeightMm = travelHeightMm;
    }
    if (lengthMm === null) {
      delete next.lengthMm;
    } else if (lengthMm !== undefined) {
      next.lengthMm = lengthMm;
    }
    if (combinedLengthMm === null) {
      delete next.combinedLengthMm;
    } else if (combinedLengthMm !== undefined) {
      next.combinedLengthMm = combinedLengthMm;
    }
    if (clearancePassengerMm === null) {
      delete next.clearancePassengerMm;
    } else if (clearancePassengerMm !== undefined) {
      next.clearancePassengerMm = clearancePassengerMm;
    }
    if (clearanceDriverMm === null) {
      delete next.clearanceDriverMm;
    } else if (clearanceDriverMm !== undefined) {
      next.clearanceDriverMm = clearanceDriverMm;
    }
    if (editedAt === undefined) {
      return this.rigs.save(next);
    }
    // Per-record LWW (ADR-0028, issue #141): only a strictly newer stamp
    // applies; a stale one is a no-op returning the current record as a
    // normal 200 — never an error.
    const { record } = await this.rigs.saveIfNewer(next, editedAt);
    return record;
  }

  /** Delete one of the owner's rigs. */
  async remove(ownerId: Id, id: Id): Promise<void> {
    const rig = await this.findOwned(ownerId, id);
    await this.rigs.delete(rig.id);
  }
}

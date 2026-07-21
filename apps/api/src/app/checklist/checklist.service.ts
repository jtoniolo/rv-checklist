import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ChecklistRepository,
  ownedOrUndefined,
  RigRepository,
} from '@rv-checklist/api-data-access';
import type {
  Checklist,
  CreateChecklist,
  Id,
  Step,
  StepPatch,
  UpdateChecklist,
} from '@rv-checklist/domain';

/**
 * Assign a stable id to every step, minting one only for a step that has none.
 * An existing step keeps its id across a reorder or edit (so a run built later
 * still lines up), and a newly added step gets a fresh one. A create body's
 * steps have no ids at all, so they all get minted — the same code path.
 */
function withStepIds(steps: readonly StepPatch[]): Step[] {
  return steps.map((step) => ({ ...step, id: step.id ?? randomUUID() }));
}

/**
 * Checklist authoring, owner-scoped (issue #15). A checklist belongs to a rig,
 * not directly to an owner (ADR-0006), so ownership (ADR-0003) is enforced *via
 * the rig*: every operation resolves the checklist's rig through
 * {@link ownedOrUndefined}, so one owner can never see, edit, or delete a
 * checklist on another's rig — a foreign id is indistinguishable from "not
 * found". Editing never mutates a past run: a run holds its own copy of the
 * steps (a separate aggregate), so this use-case only ever rewrites the
 * template. It holds no HTTP or persistence detail, depending only on the
 * repository ports, so the whole guarantee is exercised with no database.
 */
@Injectable()
export class ChecklistService {
  constructor(
    private readonly checklists: ChecklistRepository,
    private readonly rigs: RigRepository,
  ) {}

  /** Whether the rig exists and belongs to the owner — the single ownership gate. */
  private async ownsRig(ownerId: Id, rigId: Id): Promise<boolean> {
    return (
      ownedOrUndefined(await this.rigs.findById(rigId), ownerId) !== undefined
    );
  }

  /** Assert the owner owns the rig, or reject the operation. */
  private async assertOwnsRig(ownerId: Id, rigId: Id): Promise<void> {
    if (!(await this.ownsRig(ownerId, rigId))) {
      throw new NotFoundException('Rig not found');
    }
  }

  /** Add a checklist to one of the owner's rigs — the server assigns the ids. */
  async create(ownerId: Id, input: CreateChecklist): Promise<Checklist> {
    await this.assertOwnsRig(ownerId, input.rigId);
    return this.checklists.save({
      id: randomUUID(),
      rigId: input.rigId,
      name: input.name,
      tags: input.tags,
      steps: withStepIds(input.steps),
    });
  }

  /** The checklists of one of the owner's rigs. */
  async list(ownerId: Id, rigId: Id): Promise<Checklist[]> {
    await this.assertOwnsRig(ownerId, rigId);
    return this.checklists.listByRig(rigId);
  }

  /** One of the owner's checklists, or `NotFound` if missing or another's. */
  async get(ownerId: Id, id: Id): Promise<Checklist> {
    const checklist = await this.checklists.findById(id);
    // Resolve ownership through the checklist's rig (ADR-0006); a foreign or
    // missing checklist is indistinguishable — both are "not found".
    if (checklist && (await this.ownsRig(ownerId, checklist.rigId))) {
      return checklist;
    }
    throw new NotFoundException('Checklist not found');
  }

  /** Apply a partial edit to one of the owner's checklists (rig never changes). */
  async update(
    ownerId: Id,
    id: Id,
    changes: UpdateChecklist,
  ): Promise<Checklist> {
    const existing = await this.get(ownerId, id);
    return this.checklists.save({
      ...existing,
      ...(changes.name !== undefined && { name: changes.name }),
      ...(changes.tags !== undefined && { tags: changes.tags }),
      ...(changes.steps !== undefined && {
        steps: withStepIds(changes.steps),
      }),
    });
  }

  /** Delete one of the owner's checklists. */
  async remove(ownerId: Id, id: Id): Promise<void> {
    const checklist = await this.get(ownerId, id);
    await this.checklists.delete(checklist.id);
  }
}

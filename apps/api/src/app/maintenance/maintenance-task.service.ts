import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  MaintenanceTaskRepository,
  ownedOrUndefined,
  RigRepository,
} from '@rv-checklist/api-data-access';
import type {
  CreateMaintenanceTask,
  Id,
  MaintenanceTask,
  UpdateMaintenanceTask,
} from '@rv-checklist/domain';

/**
 * Maintenance-task CRUD, owner-scoped (issue #17). A task belongs to a rig
 * (ADR-0006), so ownership (ADR-0003) is enforced *via the rig*, exactly as
 * {@link RunService} does: every operation resolves the task's (or target) rig
 * through {@link ownedOrUndefined}, so one owner can never see, edit, or delete
 * another's task — a foreign id is indistinguishable from "not found".
 *
 * Editing a task never touches its log entries: each entry carries its own
 * snapshot of the fields (ADR-0004), so the "edits don't disturb history"
 * guarantee is structural — nothing here needs to defend it. Due/overdue is
 * not this service's concern either: it is computed on read from the interval
 * and the log (ADR-0005), by the shared `dueStatus` domain function.
 */
@Injectable()
export class MaintenanceTaskService {
  constructor(
    private readonly tasks: MaintenanceTaskRepository,
    private readonly rigs: RigRepository,
  ) {}

  /** Whether the rig exists and belongs to the owner — the single ownership gate. */
  private async ownsRig(ownerId: Id, rigId: Id): Promise<boolean> {
    return (
      ownedOrUndefined(await this.rigs.findById(rigId), ownerId) !== undefined
    );
  }

  /** Create a task on one of the owner's rigs — the server assigns the id. */
  async create(
    ownerId: Id,
    input: CreateMaintenanceTask,
  ): Promise<MaintenanceTask> {
    if (!(await this.ownsRig(ownerId, input.rigId))) {
      throw new NotFoundException('Rig not found');
    }
    return this.tasks.save({ id: randomUUID(), ...input });
  }

  /** One of the owner's tasks, or `NotFound` if missing or another's. */
  async get(ownerId: Id, id: Id): Promise<MaintenanceTask> {
    const task = await this.tasks.findById(id);
    if (task && (await this.ownsRig(ownerId, task.rigId))) {
      return task;
    }
    throw new NotFoundException('Maintenance task not found');
  }

  /** The tasks on one of the owner's rigs. */
  async listByRig(ownerId: Id, rigId: Id): Promise<MaintenanceTask[]> {
    if (!(await this.ownsRig(ownerId, rigId))) {
      throw new NotFoundException('Rig not found');
    }
    return this.tasks.listByRig(rigId);
  }

  /**
   * Apply a partial edit to one of the owner's tasks (rig membership never
   * changes). An explicit `null` removes an optional field: `interval: null`
   * stops due-status tracking (CONTEXT.md), `oneTime: null` clears the one-time
   * marker (issue #29), `description: null` clears the description (issue #25).
   *
   * `interval` and `oneTime` are mutually exclusive (issue #29): if a single
   * edit would leave both set, whichever the edit itself set wins and the other
   * is dropped, so the saved task never holds both — the invariant the wire
   * schema guards is upheld here before the write.
   *
   * `lastPerformed` is the manual calendar anchor (issue #33): `null` clears it,
   * a date sets it. It rides only with a calendar interval, so once the edit's
   * interval/one-time changes have settled, it is dropped whenever the task no
   * longer has a calendar interval — the calendar-only invariant the full schema
   * guards, upheld here before the write.
   */
  async update(
    ownerId: Id,
    id: Id,
    changes: UpdateMaintenanceTask,
  ): Promise<MaintenanceTask> {
    const existing = await this.get(ownerId, id);
    const next: MaintenanceTask = {
      ...existing,
      ...(changes.name !== undefined && { name: changes.name }),
      ...(changes.fieldSchema !== undefined && {
        fieldSchema: changes.fieldSchema,
      }),
    };
    if (changes.interval === null) {
      delete next.interval;
    } else if (changes.interval !== undefined) {
      next.interval = changes.interval;
    }
    if (changes.oneTime === null) {
      delete next.oneTime;
    } else if (changes.oneTime === true) {
      next.oneTime = true;
    }
    // Exclusivity: an edit that set both leaves the one it set, drops the other.
    if (next.oneTime && next.interval !== undefined) {
      if (changes.oneTime === true) {
        delete next.interval;
      } else {
        delete next.oneTime;
      }
    }
    if (changes.lastPerformed === null) {
      delete next.lastPerformed;
    } else if (changes.lastPerformed !== undefined) {
      next.lastPerformed = changes.lastPerformed;
    }
    // The manual anchor rides only with an interval carrying a calendar limit
    // (issue #33, ADR-0016): drop it whenever this edit leaves the task without a
    // `months` limit (interval removed, switched to distance-only, or made
    // one-time), so the saved task never holds a stray anchor.
    if (next.interval?.months === undefined) {
      delete next.lastPerformed;
    }
    if (changes.description === null) {
      delete next.description;
    } else if (changes.description !== undefined) {
      next.description = changes.description;
    }
    // Tags replace the whole set (issue #41): provide to overwrite, omit to keep.
    if (changes.tags !== undefined) {
      next.tags = changes.tags;
    }
    return this.tasks.save(next);
  }

  /** Delete one of the owner's tasks (its log entries go with it, ADR-0006). */
  async remove(ownerId: Id, id: Id): Promise<void> {
    const task = await this.get(ownerId, id);
    await this.tasks.delete(task.id);
  }
}

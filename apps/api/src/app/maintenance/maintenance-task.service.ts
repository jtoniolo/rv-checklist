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
   * changes). `interval: null` removes the interval — the task stops being
   * tracked for due-status (CONTEXT.md).
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
    return this.tasks.save(next);
  }

  /** Delete one of the owner's tasks (its log entries go with it, ADR-0006). */
  async remove(ownerId: Id, id: Id): Promise<void> {
    const task = await this.get(ownerId, id);
    await this.tasks.delete(task.id);
  }
}

import { Injectable } from '@nestjs/common';
import type { Id, StepInput } from '@rv-checklist/domain';
import { ChecklistService } from '../checklist/checklist.service.js';
import { MaintenanceTaskService } from '../maintenance/maintenance-task.service.js';
import { RigService } from '../rig/rig.service.js';
import {
  SEED_CHECKLISTS,
  SEED_RIG_NICKNAME,
  SEED_TASKS,
  type SeedStep,
} from './seed-content.js';

/**
 * The seam {@link AuthService} hangs first-sign-in seeding on, kept abstract
 * (like {@link Clock}) so the auth flow stays unit-testable without dragging
 * the whole domain stack into its tests.
 */
export abstract class StarterContentSeeder {
  abstract seedStarterContent(ownerId: Id): Promise<void>;
}

/**
 * The seed loader (issue #19): gives a brand-new owner a towable travel
 * trailer's worth of starter content from `docs/seed-content.md` — one rig,
 * 35 maintenance tasks, and 9 checklists whose ⚙︎ procedure steps are
 * pre-linked to the tasks they perform. Everything is created through the same
 * use-cases as user content ({@link RigService}, {@link MaintenanceTaskService},
 * {@link ChecklistService}), so the seeds are ordinary editable rows — no
 * read-only concept, no side door past ownership or validation. The content
 * references tasks by name; this loader resolves those names to the ids the
 * task use-case just assigned.
 */
@Injectable()
export class SeedService extends StarterContentSeeder {
  constructor(
    private readonly rigs: RigService,
    private readonly checklists: ChecklistService,
    private readonly tasks: MaintenanceTaskService,
  ) {
    super();
  }

  async seedStarterContent(ownerId: Id): Promise<void> {
    const rig = await this.rigs.create(ownerId, {
      nickname: SEED_RIG_NICKNAME,
    });
    const taskIdsByName = new Map<string, Id>();
    for (const task of SEED_TASKS) {
      const created = await this.tasks.create(ownerId, {
        rigId: rig.id,
        name: task.name,
        description: task.description,
        interval: task.interval,
        fieldSchema: task.fieldSchema,
      });
      taskIdsByName.set(task.name, created.id);
    }
    for (const checklist of SEED_CHECKLISTS) {
      await this.checklists.create(ownerId, {
        rigId: rig.id,
        name: checklist.name,
        tags: [...checklist.tags],
        steps: checklist.steps.map((step) => toStepInput(step, taskIdsByName)),
      });
    }
  }
}

/**
 * A seed step as a create body, its ⚙︎ task name resolved to the created id.
 * An unresolvable name throws: it can only mean the seed content drifted, and
 * a loud failure beats silently seeding an unlinked step.
 */
function toStepInput(
  step: SeedStep,
  taskIdsByName: ReadonlyMap<string, Id>,
): StepInput {
  if (step.task !== undefined && !taskIdsByName.has(step.task)) {
    throw new Error(`seed step references an unknown task: ${step.task}`);
  }
  return {
    text: step.text,
    ...(step.task !== undefined && { taskId: taskIdsByName.get(step.task) }),
    ...(step.fieldSchema !== undefined && { fieldSchema: step.fieldSchema }),
  };
}

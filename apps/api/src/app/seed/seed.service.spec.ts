import {
  createInMemoryRepositories,
  type InMemoryRepositories,
} from '@rv-checklist/domain/testing';
import { Clock } from '../auth/clock.js';
import { ChecklistService } from '../checklist/checklist.service.js';
import { MaintenanceTaskService } from '../maintenance/maintenance-task.service.js';
import { RigService } from '../rig/rig.service.js';
import { RunService } from '../run/run.service.js';
import { SEED_RIG_NICKNAME } from './seed-content.js';
import { SeedService } from './seed.service.js';

const owner = '550e8400-e29b-41d4-a716-446655440001';

class FakeClock extends Clock {
  now(): Date {
    return new Date('2026-07-22T12:00:00.000Z');
  }
}

function build(): {
  seed: SeedService;
  repos: InMemoryRepositories;
  checklists: ChecklistService;
  tasks: MaintenanceTaskService;
  runs: RunService;
} {
  const repos = createInMemoryRepositories();
  const checklists = new ChecklistService(repos.checklists, repos.rigs);
  const tasks = new MaintenanceTaskService(repos.tasks, repos.rigs);
  const runs = new RunService(
    repos.runs,
    repos.checklists,
    repos.rigs,
    repos.tasks,
    repos.logEntries,
    new FakeClock(),
  );
  const seed = new SeedService(new RigService(repos.rigs), checklists, tasks);
  return { seed, repos, checklists, tasks, runs };
}

describe('SeedService.seedStarterContent', () => {
  it('creates the starter rig for the owner', async () => {
    const { seed, repos } = build();

    await seed.seedStarterContent(owner);

    const rigs = await repos.rigs.listByOwner(owner);
    expect(rigs).toHaveLength(1);
    expect(rigs[0]?.nickname).toBe(SEED_RIG_NICKNAME);
  });

  it('creates the 16 maintenance tasks with intervals and field schemas', async () => {
    const { seed, repos } = build();

    await seed.seedStarterContent(owner);

    const [rig] = await repos.rigs.listByOwner(owner);
    const tasks = await repos.tasks.listByRig(rig?.id ?? '');
    expect(tasks).toHaveLength(16);
    // Every seeded task carries its why/how description through to the row
    // (issue #26) — the detail screen renders it.
    for (const task of tasks) {
      expect(task.description?.trim()).toBeTruthy();
    }
    const bearings = tasks.find(
      (t) => t.name === 'Repack / inspect wheel bearings',
    );
    expect(bearings?.interval).toEqual({ months: 12 });
    expect(bearings?.description).toContain('Worn or dry wheel bearings');
    expect(bearings?.fieldSchema).toEqual([
      { name: 'grease type', type: 'text', required: false },
      { name: 'odometer', type: 'number', required: false, unit: 'mi' },
    ]);
  });

  it('creates the 9 checklists with their tags and ordered steps', async () => {
    const { seed, repos } = build();

    await seed.seedStarterContent(owner);

    const [rig] = await repos.rigs.listByOwner(owner);
    const checklists = await repos.checklists.listByRig(rig?.id ?? '');
    expect(checklists).toHaveLength(9);
    const departure = checklists.find((c) => c.name === 'Departure');
    expect(departure?.tags).toEqual(['procedure', 'departure']);
    expect(departure?.steps[0]?.text).toBe('Retract / stow slides');
    // The ✎ usage readings ride on Departure as plain-step fields.
    const odometer = departure?.steps.find((s) => s.text === 'Odometer');
    expect(odometer?.fieldSchema).toEqual([
      { name: 'Odometer', type: 'number', required: false, unit: 'mi' },
    ]);
  });

  it('links every ⚙︎ procedure step to the seeded task it performs', async () => {
    const { seed, repos } = build();

    await seed.seedStarterContent(owner);

    const [rig] = await repos.rigs.listByOwner(owner);
    const tasks = await repos.tasks.listByRig(rig?.id ?? '');
    const tasksById = new Map(tasks.map((t) => [t.id, t.name]));
    const checklists = await repos.checklists.listByRig(rig?.id ?? '');
    const spring = checklists.find((c) => c.name === 'Spring opening');
    const slideSeals = spring?.steps.find(
      (s) => s.text === 'Condition slide seals',
    );
    expect(slideSeals?.taskId).toBeDefined();
    expect(tasksById.get(slideSeals?.taskId ?? '')).toBe(
      'Condition slide-out seals',
    );
    const linked = checklists
      .flatMap((c) => c.steps)
      .filter((s) => s.taskId !== undefined);
    expect(linked).toHaveLength(16);
    for (const step of linked) {
      expect(tasksById.has(step.taskId ?? '')).toBe(true);
    }
  });

  it('seeds ordinary editable content — the owner can rename it like anything else', async () => {
    const { seed, repos, checklists, tasks } = build();
    await seed.seedStarterContent(owner);
    const [rig] = await repos.rigs.listByOwner(owner);
    const [checklist] = await repos.checklists.listByRig(rig?.id ?? '');
    const [task] = await repos.tasks.listByRig(rig?.id ?? '');

    const renamedChecklist = await checklists.update(
      owner,
      checklist?.id ?? '',
      { name: 'My own list now' },
    );
    const renamedTask = await tasks.update(owner, task?.id ?? '', {
      name: 'My own task now',
    });

    expect(renamedChecklist.name).toBe('My own list now');
    expect(renamedTask.name).toBe('My own task now');
  });

  it('running a seeded procedure logs the maintenance it covers (T8)', async () => {
    const { seed, repos, runs } = build();
    await seed.seedStarterContent(owner);
    const [rig] = await repos.rigs.listByOwner(owner);
    const checklists = await repos.checklists.listByRig(rig?.id ?? '');
    const spring = checklists.find((c) => c.name === 'Spring opening');

    const run = await runs.create(owner, { checklistId: spring?.id ?? '' });
    const completed = await runs.update(owner, run.id, {
      steps: run.steps.map((step) =>
        step.text === 'Condition slide seals'
          ? {
              ...step,
              state: 'complete',
              values: [{ name: 'product', value: 'Slide-seal conditioner' }],
            }
          : step,
      ),
    });

    const seededTasks = await repos.tasks.listByRig(rig?.id ?? '');
    const task = seededTasks.find(
      (t) => t.name === 'Condition slide-out seals',
    );
    const entries = await repos.logEntries.listByTask(task?.id ?? '');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.fields).toEqual([
      {
        name: 'product',
        type: 'text',
        required: false,
        value: 'Slide-seal conditioner',
      },
    ]);
    const step = completed.steps.find(
      (s) => s.text === 'Condition slide seals',
    );
    expect(step?.logEntryId).toBe(entries[0]?.id);
  });
});

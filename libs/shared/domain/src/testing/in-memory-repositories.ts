import type { Checklist } from '../lib/checklist.js';
import type { Id } from '../lib/common.js';
import type { LogEntry } from '../lib/log-entry.js';
import type { MaintenanceTask } from '../lib/maintenance-task.js';
import type {
  ChecklistRepository,
  LogEntryRepository,
  MaintenanceTaskRepository,
  RigRepository,
  RunRepository,
} from '../lib/ports.js';
import type { Rig } from '../lib/rig.js';
import type { Run } from '../lib/run.js';

/**
 * In-memory repository double — the test-support binding for the repository ports
 * (spec §Testing). Backs each aggregate with a `Map` and clones on the way in and out, so
 * a test can never accidentally alias stored state. Use-case tests bind their services to
 * these instead of the TypeORM implementations, exercising the whole core loop with no DB.
 */

function clone<T>(value: T): T {
  return structuredClone(value);
}

abstract class InMemoryRepository<T extends { readonly id: Id }> {
  protected readonly store = new Map<Id, T>();

  findById(id: Id): Promise<T | undefined> {
    const found = this.store.get(id);
    return Promise.resolve(found === undefined ? undefined : clone(found));
  }

  save(entity: T): Promise<T> {
    this.store.set(entity.id, clone(entity));
    return Promise.resolve(clone(entity));
  }

  delete(id: Id): Promise<void> {
    this.store.delete(id);
    return Promise.resolve();
  }

  protected where(isMatch: (entity: T) => boolean): Promise<T[]> {
    const results: T[] = [];
    for (const entity of this.store.values()) {
      if (isMatch(entity)) {
        results.push(clone(entity));
      }
    }
    return Promise.resolve(results);
  }
}

export class InMemoryRigRepository
  extends InMemoryRepository<Rig>
  implements RigRepository
{
  listByOwner(ownerId: Id): Promise<Rig[]> {
    return this.where((r) => r.ownerId === ownerId);
  }
}

export class InMemoryChecklistRepository
  extends InMemoryRepository<Checklist>
  implements ChecklistRepository
{
  listByRig(rigId: Id): Promise<Checklist[]> {
    return this.where((c) => c.rigId === rigId);
  }
}

export class InMemoryRunRepository
  extends InMemoryRepository<Run>
  implements RunRepository
{
  listByRig(rigId: Id): Promise<Run[]> {
    return this.where((r) => r.rigId === rigId);
  }

  listByChecklist(checklistId: Id): Promise<Run[]> {
    return this.where((r) => r.checklistId === checklistId);
  }
}

export class InMemoryMaintenanceTaskRepository
  extends InMemoryRepository<MaintenanceTask>
  implements MaintenanceTaskRepository
{
  listByRig(rigId: Id): Promise<MaintenanceTask[]> {
    return this.where((t) => t.rigId === rigId);
  }
}

export class InMemoryLogEntryRepository
  extends InMemoryRepository<LogEntry>
  implements LogEntryRepository
{
  listByRig(rigId: Id): Promise<LogEntry[]> {
    return this.where((e) => e.rigId === rigId);
  }

  listByTask(taskId: Id): Promise<LogEntry[]> {
    return this.where((e) => e.taskId === taskId);
  }
}

/** The full set of in-memory repositories, one per aggregate. */
export interface InMemoryRepositories {
  readonly rigs: InMemoryRigRepository;
  readonly checklists: InMemoryChecklistRepository;
  readonly runs: InMemoryRunRepository;
  readonly tasks: InMemoryMaintenanceTaskRepository;
  readonly logEntries: InMemoryLogEntryRepository;
}

/** Fresh, empty in-memory repositories — the usual starting point for a use-case test. */
export function createInMemoryRepositories(): InMemoryRepositories {
  return {
    rigs: new InMemoryRigRepository(),
    checklists: new InMemoryChecklistRepository(),
    runs: new InMemoryRunRepository(),
    tasks: new InMemoryMaintenanceTaskRepository(),
    logEntries: new InMemoryLogEntryRepository(),
  };
}

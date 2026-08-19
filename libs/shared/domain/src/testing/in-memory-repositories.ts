import type { Checklist } from '../lib/checklist.js';
import type { Id } from '../lib/common.js';
import type { EquipmentItem } from '../lib/equipment.js';
import type { LogEntry } from '../lib/log-entry.js';
import type { MaintenanceTask } from '../lib/maintenance-task.js';
import type {
  ChecklistRepository,
  EquipmentItemRepository,
  LogEntryRepository,
  MaintenanceTaskRepository,
  RigRepository,
  RunRepository,
  StopRepository,
  TripRepository,
} from '../lib/ports.js';
import type { Rig } from '../lib/rig.js';
import type { Run } from '../lib/run.js';
import type { Stop, Trip } from '../lib/trip.js';

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

  listByTrip(tripId: Id): Promise<Run[]> {
    return this.where((r) => r.tripId === tripId);
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

export class InMemoryEquipmentItemRepository
  extends InMemoryRepository<EquipmentItem>
  implements EquipmentItemRepository
{
  listByRig(rigId: Id): Promise<EquipmentItem[]> {
    return this.where((e) => e.rigId === rigId);
  }
}

export class InMemoryTripRepository
  extends InMemoryRepository<Trip>
  implements TripRepository
{
  listByRig(rigId: Id): Promise<Trip[]> {
    return this.where((t) => t.rigId === rigId);
  }
}

export class InMemoryStopRepository
  extends InMemoryRepository<Stop>
  implements StopRepository
{
  /** Position-ordered, matching the SQL implementation's ORDER BY. */
  async listByTrip(tripId: Id): Promise<Stop[]> {
    const stops = await this.where((s) => s.tripId === tripId);
    // `where` returns a fresh array of clones, so sorting in place aliases nothing.
    stops.sort((a, b) => a.position - b.position);
    return stops;
  }
}

/** The full set of in-memory repositories, one per aggregate. */
export interface InMemoryRepositories {
  readonly rigs: InMemoryRigRepository;
  readonly checklists: InMemoryChecklistRepository;
  readonly runs: InMemoryRunRepository;
  readonly tasks: InMemoryMaintenanceTaskRepository;
  readonly logEntries: InMemoryLogEntryRepository;
  readonly equipmentItems: InMemoryEquipmentItemRepository;
  readonly trips: InMemoryTripRepository;
  readonly stops: InMemoryStopRepository;
}

/** Fresh, empty in-memory repositories — the usual starting point for a use-case test. */
export function createInMemoryRepositories(): InMemoryRepositories {
  return {
    rigs: new InMemoryRigRepository(),
    checklists: new InMemoryChecklistRepository(),
    runs: new InMemoryRunRepository(),
    tasks: new InMemoryMaintenanceTaskRepository(),
    logEntries: new InMemoryLogEntryRepository(),
    equipmentItems: new InMemoryEquipmentItemRepository(),
    trips: new InMemoryTripRepository(),
    stops: new InMemoryStopRepository(),
  };
}

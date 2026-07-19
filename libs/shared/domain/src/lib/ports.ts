import type { Checklist } from './checklist.js';
import type { Id } from './common.js';
import type { LogEntry } from './log-entry.js';
import type { MaintenanceTask } from './maintenance-task.js';
import type { Rig } from './rig.js';
import type { Run } from './run.js';

/**
 * Repository ports — the seam that makes the whole core loop unit-testable without a
 * database (spec §Testing). One interface per aggregate, expressed purely in domain terms:
 * no TypeORM, SQL, or persistence shape leaks through. Production binds these to the
 * TypeORM implementations in `libs/api/data-access`; tests bind them to the in-memory
 * double under `@rv-checklist/domain/testing`.
 *
 * `save` is upsert (create-or-replace the whole aggregate); the use-case assigns ids and
 * builds the full aggregate before saving. Every read is scoped to its parent so ownership
 * scoping (ADR-0003) is enforceable a layer up.
 */
export interface Repository<T> {
  findById(id: Id): Promise<T | undefined>;
  save(entity: T): Promise<T>;
  delete(id: Id): Promise<void>;
}

/** Rigs — the aggregate root, scoped to their owner (ADR-0003, ADR-0006). */
export interface RigRepository extends Repository<Rig> {
  listByOwner(ownerId: Id): Promise<Rig[]>;
}

/** Checklists — reusable templates belonging to a rig. */
export interface ChecklistRepository extends Repository<Checklist> {
  listByRig(rigId: Id): Promise<Checklist[]>;
}

/** Runs — dated copies of a checklist's steps. */
export interface RunRepository extends Repository<Run> {
  listByRig(rigId: Id): Promise<Run[]>;
  listByChecklist(checklistId: Id): Promise<Run[]>;
}

/** Maintenance tasks — recurring upkeep jobs on a rig. */
export interface MaintenanceTaskRepository extends Repository<MaintenanceTask> {
  listByRig(rigId: Id): Promise<MaintenanceTask[]>;
}

/** Log entries — dated records that a task was performed. */
export interface LogEntryRepository extends Repository<LogEntry> {
  listByRig(rigId: Id): Promise<LogEntry[]>;
  listByTask(taskId: Id): Promise<LogEntry[]>;
}

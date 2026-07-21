import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  Id,
  MaintenanceTask,
  MaintenanceTaskRepository as MaintenanceTaskRepositoryPort,
} from '@rv-checklist/domain';
import { Repository } from 'typeorm';
import { MaintenanceTaskEntity } from './entities/maintenance-task.entity.js';

/**
 * The {@link MaintenanceTaskRepositoryPort} as a concrete Nest DI token (an
 * abstract class, so it survives type erasure). The use-case in `apps/api`
 * injects this; the module binds it to {@link TypeOrmMaintenanceTaskRepository}
 * in production and a test binds it to the in-memory double under
 * `@rv-checklist/domain/testing`. Owner scoping (ADR-0003) is enforced a layer
 * up in the use-case (a task is owned via its rig), so no ownership rule lives
 * here.
 */
export abstract class MaintenanceTaskRepository implements MaintenanceTaskRepositoryPort {
  abstract findById(id: Id): Promise<MaintenanceTask | undefined>;
  abstract save(task: MaintenanceTask): Promise<MaintenanceTask>;
  abstract delete(id: Id): Promise<void>;
  abstract listByRig(rigId: Id): Promise<MaintenanceTask[]>;
}

/** The persisted row (timestamps, flattened interval) narrowed to the wire model. */
function toTask(entity: MaintenanceTaskEntity): MaintenanceTask {
  return {
    id: entity.id,
    rigId: entity.rigId,
    name: entity.name,
    // SQL NULL means no interval — the task is untracked (CONTEXT.md).
    ...(entity.intervalMonths !== null && {
      interval: { months: entity.intervalMonths },
    }),
    fieldSchema: entity.fieldSchema,
  };
}

/** The wire model's optional interval flattened to the row's nullable column. */
function toRow(task: MaintenanceTask): Partial<MaintenanceTaskEntity> {
  return {
    id: task.id,
    rigId: task.rigId,
    name: task.name,
    // SQL NULL must be written explicitly: `save` skips `undefined` columns,
    // which would leave a removed interval in place.
    // eslint-disable-next-line unicorn/no-null
    intervalMonths: task.interval?.months ?? null,
    fieldSchema: task.fieldSchema,
  };
}

/**
 * TypeORM-backed {@link MaintenanceTaskRepository} (ADR-0009). `save` is a
 * whole-aggregate upsert — the use-case assigns the id and hands over a
 * complete {@link MaintenanceTask} — and the embedded `field_schema` JSONB is
 * replaced wholesale. The persistence shape (timestamps, `interval_months`)
 * never leaves this lib.
 */
@Injectable()
export class TypeOrmMaintenanceTaskRepository extends MaintenanceTaskRepository {
  constructor(
    @InjectRepository(MaintenanceTaskEntity)
    private readonly repo: Repository<MaintenanceTaskEntity>,
  ) {
    super();
  }

  async findById(id: Id): Promise<MaintenanceTask | undefined> {
    const found = await this.repo.findOne({ where: { id } });
    return found ? toTask(found) : undefined;
  }

  async save(task: MaintenanceTask): Promise<MaintenanceTask> {
    const saved = await this.repo.save(this.repo.create(toRow(task)));
    return toTask(saved);
  }

  async delete(id: Id): Promise<void> {
    await this.repo.delete(id);
  }

  async listByRig(rigId: Id): Promise<MaintenanceTask[]> {
    // Alphabetical — the task list is a reference the owner scans by name.
    const rows = await this.repo.find({
      where: { rigId },
      order: { name: 'ASC' },
    });
    return rows.map((row) => toTask(row));
  }
}

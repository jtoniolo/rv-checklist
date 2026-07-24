import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  Id,
  LogEntry,
  LogEntryRepository as LogEntryRepositoryPort,
} from '@rv-checklist/domain';
import { Repository } from 'typeorm';
import { LogEntryEntity } from './entities/log-entry.entity.js';

/**
 * The {@link LogEntryRepositoryPort} as a concrete Nest DI token (an abstract
 * class, so it survives type erasure). The use-case in `apps/api` injects this;
 * the module binds it to {@link TypeOrmLogEntryRepository} in production and a
 * test binds it to the in-memory double under `@rv-checklist/domain/testing`.
 * Owner scoping (ADR-0003) is enforced a layer up in the use-case (an entry is
 * owned via its rig), so no ownership rule lives here.
 */
export abstract class LogEntryRepository implements LogEntryRepositoryPort {
  abstract findById(id: Id): Promise<LogEntry | undefined>;
  abstract save(entry: LogEntry): Promise<LogEntry>;
  abstract delete(id: Id): Promise<void>;
  abstract listByRig(rigId: Id): Promise<LogEntry[]>;
  abstract listByTask(taskId: Id): Promise<LogEntry[]>;
}

/** The persisted row (with its timestamps) narrowed to the {@link LogEntry} wire model. */
function toLogEntry(entity: LogEntryEntity): LogEntry {
  return {
    id: entity.id,
    taskId: entity.taskId,
    rigId: entity.rigId,
    taskName: entity.taskName,
    performedOn: entity.performedOn,
    // The rig's Distance reading at the time (issue #32) — NULL when none.
    distanceKm: entity.distanceKm ?? undefined,
    fields: entity.fields,
  };
}

/** The wire model with its optional Distance reading flattened to the nullable column. */
function toRow(entry: LogEntry): Partial<LogEntryEntity> {
  return {
    ...entry,
    // SQL NULL must be written explicitly: `save` skips `undefined` columns,
    // which would leave a cleared reading in place (issue #32).
    // eslint-disable-next-line unicorn/no-null
    distanceKm: entry.distanceKm ?? null,
  };
}

/**
 * TypeORM-backed {@link LogEntryRepository} (ADR-0009). `save` is a
 * whole-aggregate upsert — the use-case assigns the id and hands over a
 * complete {@link LogEntry} — so recording a completion and correcting a past
 * one are the same write, and the embedded `fields` snapshot JSONB is replaced
 * wholesale. The persistence shape (timestamps) never leaves this lib.
 */
@Injectable()
export class TypeOrmLogEntryRepository extends LogEntryRepository {
  constructor(
    @InjectRepository(LogEntryEntity)
    private readonly repo: Repository<LogEntryEntity>,
  ) {
    super();
  }

  async findById(id: Id): Promise<LogEntry | undefined> {
    const found = await this.repo.findOne({ where: { id } });
    return found ? toLogEntry(found) : undefined;
  }

  async save(entry: LogEntry): Promise<LogEntry> {
    const saved = await this.repo.save(this.repo.create(toRow(entry)));
    return toLogEntry(saved);
  }

  async delete(id: Id): Promise<void> {
    await this.repo.delete(id);
  }

  async listByRig(rigId: Id): Promise<LogEntry[]> {
    const rows = await this.repo.find({ where: { rigId } });
    return rows.map((row) => toLogEntry(row));
  }

  async listByTask(taskId: Id): Promise<LogEntry[]> {
    // Newest completion first (created-at breaks a same-day tie) so the log
    // history reads most-recent-first — "when did I last do this?" is row one.
    const rows = await this.repo.find({
      where: { taskId },
      order: { performedOn: 'DESC', createdAt: 'DESC' },
    });
    return rows.map((row) => toLogEntry(row));
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  ConditionalWrite,
  Id,
  LogEntry,
  LogEntryRepository as LogEntryRepositoryPort,
} from '@rv-checklist/domain';
import { LessThan, Repository } from 'typeorm';
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
  abstract saveIfNewer(
    entry: LogEntry,
    editedAt: Date,
  ): Promise<ConditionalWrite<LogEntry>>;
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
    // What the task cost in cents (issue #39) — NULL when none.
    costCents: entity.costCents ?? undefined,
    // The free-text comment (issue #101) — NULL when none.
    comment: entity.comment ?? undefined,
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
    // eslint-disable-next-line unicorn/no-null
    costCents: entry.costCents ?? null,
    // eslint-disable-next-line unicorn/no-null
    comment: entry.comment ?? null,
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
    // A plain save re-stamps the LWW edit time (issue #141) — see RigRepository.
    const saved = await this.repo.save(
      this.repo.create({ ...toRow(entry), editedAt: new Date() }),
    );
    return toLogEntry(saved);
  }

  async saveIfNewer(
    entry: LogEntry,
    editedAt: Date,
  ): Promise<ConditionalWrite<LogEntry>> {
    // The strictly-newer comparison and the write are one conditional UPDATE
    // (ADR-0028) — no read-compare-write window.
    const { id: _id, ...row } = toRow(entry);
    const result = await this.repo.update(
      { id: entry.id, editedAt: LessThan(editedAt) },
      { ...row, editedAt },
    );
    const current = await this.repo.findOneByOrFail({ id: entry.id });
    return { applied: (result.affected ?? 0) > 0, record: toLogEntry(current) };
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

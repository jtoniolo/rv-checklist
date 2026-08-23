import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type {
  AttachmentMimeType,
  AttachmentRepository as AttachmentRepositoryPort,
  Id,
  StoredAttachment,
} from '@rv-checklist/domain';
import { Repository } from 'typeorm';
import { AttachmentEntity } from './entities/attachment.entity.js';

/**
 * The {@link AttachmentRepositoryPort} as a concrete Nest DI token (an
 * abstract class, so it survives type erasure). The use-case in `apps/api`
 * injects this; the module binds it to {@link TypeOrmAttachmentRepository} in
 * production and a test binds it to the in-memory double under
 * `@rv-checklist/domain/testing`. Rows are metadata only (ADR-0026) — the
 * bytes live in object storage, a separate seam. Ownership resolves through
 * the attachment's stop's trip's rig, layers up (ADR-0003).
 */
export abstract class AttachmentRepository implements AttachmentRepositoryPort {
  abstract findById(id: Id): Promise<StoredAttachment | undefined>;
  abstract save(attachment: StoredAttachment): Promise<StoredAttachment>;
  abstract delete(id: Id): Promise<void>;
  abstract listByStop(stopId: Id): Promise<StoredAttachment[]>;
}

/** The persisted row (with its timestamps) narrowed to the {@link StoredAttachment} model. */
function toAttachment(entity: AttachmentEntity): StoredAttachment {
  return {
    id: entity.id,
    stopId: entity.stopId,
    rigId: entity.rigId,
    filename: entity.filename,
    // Stored as text; every write passes through AttachmentSchema first.
    mimeType: entity.mimeType as AttachmentMimeType,
    sizeBytes: entity.sizeBytes,
    isCampgroundMap: entity.isCampgroundMap,
  };
}

function toRow(attachment: StoredAttachment): Partial<AttachmentEntity> {
  return {
    id: attachment.id,
    stopId: attachment.stopId,
    rigId: attachment.rigId,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    isCampgroundMap: attachment.isCampgroundMap,
  };
}

/**
 * TypeORM-backed {@link AttachmentRepository} (ADR-0009). `save` is a
 * whole-aggregate upsert — the use-case assigns the id and hands over a
 * complete {@link StoredAttachment}. The persistence shape (timestamps) never
 * leaves this lib.
 */
@Injectable()
export class TypeOrmAttachmentRepository extends AttachmentRepository {
  constructor(
    @InjectRepository(AttachmentEntity)
    private readonly repo: Repository<AttachmentEntity>,
  ) {
    super();
  }

  async findById(id: Id): Promise<StoredAttachment | undefined> {
    const found = await this.repo.findOne({ where: { id } });
    return found ? toAttachment(found) : undefined;
  }

  async save(attachment: StoredAttachment): Promise<StoredAttachment> {
    const saved = await this.repo.save(this.repo.create(toRow(attachment)));
    return toAttachment(saved);
  }

  async delete(id: Id): Promise<void> {
    await this.repo.delete(id);
  }

  async listByStop(stopId: Id): Promise<StoredAttachment[]> {
    // Upload order — stable for the stop's attachment list, matching the
    // in-memory double's insertion order.
    const rows = await this.repo.find({
      where: { stopId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => toAttachment(row));
  }
}

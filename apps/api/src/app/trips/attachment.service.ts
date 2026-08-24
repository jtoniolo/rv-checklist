import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import {
  AttachmentRepository,
  ownedOrUndefined,
  RigRepository,
  StopRepository,
  TripRepository,
} from '@rv-checklist/api-data-access';
import {
  AttachmentMimeTypeSchema,
  attachmentMimeTypes,
  maxAttachmentSizeBytes,
  type Attachment,
  type Id,
  type StoredAttachment,
  type StoredStop,
} from '@rv-checklist/domain';
import { adoptCreated } from '../common/adopt-created.js';
import { ObjectStorage } from '../storage/object-storage.js';
import { attachmentObjectKey } from './attachment-keys.js';

/** An incoming upload: what multipart gives us. The size is the buffer's own. */
export interface NewAttachmentFile {
  readonly filename: string;
  readonly mimeType: string;
  readonly content: Buffer;
}

/**
 * What an upload may carry besides the bytes (issue #143): the client's own
 * attachment id — so a Background-Sync replay of a queued capture lands on the
 * row it already named — the campground-map flag, set with the bytes instead of
 * by a second request, and the client's edit stamp for the new row's LWW clock.
 */
export interface NewAttachmentOptions {
  readonly id?: Id;
  readonly isCampgroundMap?: boolean;
  readonly editedAt?: Date;
}

/** A proxied download: the metadata row plus the byte stream from the bucket. */
export interface AttachmentDownload {
  readonly attachment: Attachment;
  readonly body: Readable;
}

/**
 * Stop attachments (ADR-0026, issue #113): upload, proxied download, the
 * campground-map flag, and hard deletion. An attachment belongs to a stop, so
 * ownership (ADR-0003) is enforced *via the stop's trip's rig*, exactly as
 * {@link StopService} does — a foreign id is indistinguishable from "not
 * found".
 *
 * Bytes live in the app's Garage bucket under `stops/<stopId>/<id>`; the row
 * carries the metadata (filename, MIME type, size, map flag) and is what stop
 * reads embed. Transfer is API-proxied through {@link ObjectStorage} — no
 * presigned URLs, Garage stays internal. Deletion removes the object *and*
 * the row; the stop- and trip-level cascades live on their own services.
 */
@Injectable()
export class AttachmentService {
  constructor(
    private readonly attachments: AttachmentRepository,
    private readonly stops: StopRepository,
    private readonly trips: TripRepository,
    private readonly rigs: RigRepository,
    private readonly storage: ObjectStorage,
  ) {}

  /**
   * The stored row narrowed to the wire {@link Attachment}: the denormalized
   * rig_id (ADR-0028) is sync plumbing, never wire data — dropped here so no
   * read path carries it out.
   */
  private toWire({
    rigId: _rigId,
    ...attachment
  }: StoredAttachment): Attachment {
    return attachment;
  }

  /** Whether the rig exists and belongs to the owner — the single ownership gate. */
  private async ownsRig(ownerId: Id, rigId: Id): Promise<boolean> {
    return (
      ownedOrUndefined(await this.rigs.findById(rigId), ownerId) !== undefined
    );
  }

  /** The stop if the owner owns it (via its trip's rig), else `NotFound`. */
  private async ownedStop(ownerId: Id, stopId: Id): Promise<StoredStop> {
    const stop = await this.stops.findById(stopId);
    if (stop) {
      const trip = await this.trips.findById(stop.tripId);
      if (trip && (await this.ownsRig(ownerId, trip.rigId))) {
        return stop;
      }
    }
    throw new NotFoundException('Stop not found');
  }

  /** The attachment if the owner owns it (via its stop's trip's rig), else `NotFound`. */
  private async ownedAttachment(
    ownerId: Id,
    id: Id,
  ): Promise<StoredAttachment> {
    const attachment = await this.attachments.findById(id);
    if (attachment) {
      const stop = await this.stops.findById(attachment.stopId);
      if (stop) {
        const trip = await this.trips.findById(stop.tripId);
        if (trip && (await this.ownsRig(ownerId, trip.rigId))) {
          return attachment;
        }
      }
    }
    throw new NotFoundException('Attachment not found');
  }

  /** Clear the campground-map flag off every *other* attachment on the stop. */
  private async sweepSiblingFlags(stopId: Id, keepId: Id): Promise<void> {
    const siblings = await this.attachments.listByStop(stopId);
    await Promise.all(
      siblings
        .filter((a) => a.isCampgroundMap && a.id !== keepId)
        .map((a) => this.attachments.save({ ...a, isCampgroundMap: false })),
    );
  }

  /**
   * Keep a file on one of the owner's stops: validate type and size
   * (ADR-0026 — JPEG/PNG/WebP/HEIC/PDF, 15 MB, no count limit), put the
   * original bytes in the bucket, then insert the metadata row.
   *
   * `options.isCampgroundMap` rides on the inserted row, so the flag lands in
   * the same write as the bytes rather than needing a second request a queued
   * upload could lose (issue #143) — and it sweeps the flag off the stop's
   * other attachments exactly as {@link setCampgroundMap} does, so an upload
   * can never leave a stop with two campground maps.
   *
   * A re-posted client id returns the stored row untouched: one row, one
   * object, no second copy. Its bytes were re-put first, at the same key —
   * harmless for the replay this path exists for.
   */
  async upload(
    ownerId: Id,
    stopId: Id,
    file: NewAttachmentFile,
    options: NewAttachmentOptions = {},
  ): Promise<Attachment> {
    const stop = await this.ownedStop(ownerId, stopId);
    const mimeType = AttachmentMimeTypeSchema.safeParse(file.mimeType);
    if (!mimeType.success) {
      throw new BadRequestException(
        `Unsupported attachment type '${file.mimeType}' — accepted: ${attachmentMimeTypes.join(', ')}`,
      );
    }
    if (file.filename.length === 0) {
      throw new BadRequestException('Attachment needs a filename');
    }
    if (file.content.byteLength === 0) {
      throw new BadRequestException('Attachment is empty');
    }
    if (file.content.byteLength > maxAttachmentSizeBytes) {
      throw new PayloadTooLargeException(
        `Attachment exceeds the ${String(maxAttachmentSizeBytes)}-byte (15 MB) cap`,
      );
    }
    const isCampgroundMap = options.isCampgroundMap ?? false;
    const attachment: StoredAttachment = {
      id: options.id ?? randomUUID(),
      stopId: stop.id,
      // The owning rig's id, denormalized for sync (ADR-0028) — the stop
      // already carries it, so the ownership chain is walked only once;
      // never client input, immutable after create.
      rigId: stop.rigId,
      filename: file.filename,
      mimeType: mimeType.data,
      sizeBytes: file.content.byteLength,
      isCampgroundMap,
    };
    // Bytes first: a row without an object breaks download, while an object
    // without a row is unreachable and merely wastes bucket space.
    await this.storage.put(
      attachmentObjectKey(stop.id, attachment.id),
      file.content,
      attachment.mimeType,
    );
    const inserted = await this.attachments.insert(
      attachment,
      options.editedAt,
    );
    const record = adoptCreated(
      inserted,
      (existing) => existing.stopId === stop.id,
      'Attachment not found',
    );
    if (isCampgroundMap && inserted.created) {
      await this.sweepSiblingFlags(stop.id, attachment.id);
    }
    return this.toWire(record);
  }

  /** The original bytes, streamed, plus the row whose metadata sets the response headers. */
  async download(ownerId: Id, id: Id): Promise<AttachmentDownload> {
    const attachment = await this.ownedAttachment(ownerId, id);
    const stored = await this.storage.get(
      attachmentObjectKey(attachment.stopId, attachment.id),
    );
    return { attachment: this.toWire(attachment), body: stored.body };
  }

  /**
   * Flag (or unflag) the stop's campground map. At most one per stop:
   * flagging swaps the flag off any other attachment on the stop
   * (ADR-0026 — the flag is on an ordinary attachment, not a stop field).
   * Idempotent.
   *
   * The toggle is a *set* write, so it is LWW-gated on the target attachment
   * (ADR-0028, issue #141): when the stamped write applies, its sibling-sweep
   * side effect applies with it; a stale stamp is a full no-op.
   */
  async setCampgroundMap(
    ownerId: Id,
    id: Id,
    isCampgroundMap: boolean,
    editedAt?: Date,
  ): Promise<Attachment> {
    const attachment = await this.ownedAttachment(ownerId, id);
    if (editedAt !== undefined) {
      const { applied, record } = await this.attachments.saveIfNewer(
        { ...attachment, isCampgroundMap },
        editedAt,
      );
      if (applied && isCampgroundMap) {
        await this.sweepSiblingFlags(attachment.stopId, attachment.id);
      }
      return this.toWire(record);
    }
    if (isCampgroundMap) {
      await this.sweepSiblingFlags(attachment.stopId, attachment.id);
    }
    if (attachment.isCampgroundMap === isCampgroundMap) {
      return this.toWire(attachment);
    }
    return this.toWire(
      await this.attachments.save({ ...attachment, isCampgroundMap }),
    );
  }

  /** Hard-delete one attachment: its object goes first, then its row — no orphans either way. */
  async remove(ownerId: Id, id: Id): Promise<void> {
    const attachment = await this.ownedAttachment(ownerId, id);
    await this.storage.delete(
      attachmentObjectKey(attachment.stopId, attachment.id),
    );
    await this.attachments.delete(attachment.id);
  }
}

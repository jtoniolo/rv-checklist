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
  type Stop,
} from '@rv-checklist/domain';
import { ObjectStorage } from '../storage/object-storage.js';
import { attachmentObjectKey } from './attachment-keys.js';

/** An incoming upload: what multipart gives us. The size is the buffer's own. */
export interface NewAttachmentFile {
  readonly filename: string;
  readonly mimeType: string;
  readonly content: Buffer;
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

  /** Whether the rig exists and belongs to the owner — the single ownership gate. */
  private async ownsRig(ownerId: Id, rigId: Id): Promise<boolean> {
    return (
      ownedOrUndefined(await this.rigs.findById(rigId), ownerId) !== undefined
    );
  }

  /** The stop if the owner owns it (via its trip's rig), else `NotFound`. */
  private async ownedStop(ownerId: Id, stopId: Id): Promise<Stop> {
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
  private async ownedAttachment(ownerId: Id, id: Id): Promise<Attachment> {
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

  /**
   * Keep a file on one of the owner's stops: validate type and size
   * (ADR-0026 — JPEG/PNG/WebP/HEIC/PDF, 15 MB, no count limit), put the
   * original bytes in the bucket, then save the metadata row. Never the
   * campground map on arrival — that is the explicit flag operation.
   */
  async upload(
    ownerId: Id,
    stopId: Id,
    file: NewAttachmentFile,
  ): Promise<Attachment> {
    const stop = await this.ownedStop(ownerId, stopId);
    const mimeType = AttachmentMimeTypeSchema.safeParse(file.mimeType);
    if (!mimeType.success) {
      throw new BadRequestException(
        `Unsupported attachment type '${file.mimeType}' — accepted: ${attachmentMimeTypes.join(', ')}`,
      );
    }
    if (file.content.byteLength === 0) {
      throw new BadRequestException('Attachment is empty');
    }
    if (file.content.byteLength > maxAttachmentSizeBytes) {
      throw new PayloadTooLargeException(
        `Attachment exceeds the ${String(maxAttachmentSizeBytes)}-byte (15 MB) cap`,
      );
    }
    const attachment: Attachment = {
      id: randomUUID(),
      stopId: stop.id,
      filename: file.filename,
      mimeType: mimeType.data,
      sizeBytes: file.content.byteLength,
      isCampgroundMap: false,
    };
    // Bytes first: a row without an object breaks download, while an object
    // without a row is unreachable and merely wastes bucket space.
    await this.storage.put(
      attachmentObjectKey(stop.id, attachment.id),
      file.content,
      attachment.mimeType,
    );
    return this.attachments.save(attachment);
  }

  /** The original bytes, streamed, plus the row whose metadata sets the response headers. */
  async download(ownerId: Id, id: Id): Promise<AttachmentDownload> {
    const attachment = await this.ownedAttachment(ownerId, id);
    const stored = await this.storage.get(
      attachmentObjectKey(attachment.stopId, attachment.id),
    );
    return { attachment, body: stored.body };
  }

  /**
   * Flag (or unflag) the stop's campground map. At most one per stop:
   * flagging swaps the flag off any other attachment on the stop
   * (ADR-0026 — the flag is on an ordinary attachment, not a stop field).
   * Idempotent.
   */
  async setCampgroundMap(
    ownerId: Id,
    id: Id,
    isCampgroundMap: boolean,
  ): Promise<Attachment> {
    const attachment = await this.ownedAttachment(ownerId, id);
    if (isCampgroundMap) {
      const siblings = await this.attachments.listByStop(attachment.stopId);
      await Promise.all(
        siblings
          .filter((a) => a.isCampgroundMap && a.id !== attachment.id)
          .map((a) => this.attachments.save({ ...a, isCampgroundMap: false })),
      );
    }
    if (attachment.isCampgroundMap === isCampgroundMap) {
      return attachment;
    }
    return this.attachments.save({ ...attachment, isCampgroundMap });
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

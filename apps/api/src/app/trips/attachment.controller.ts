import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  maxAttachmentSizeBytes,
  type Attachment,
  type Owner,
} from '@rv-checklist/domain';
import { ZodSerializerDto } from 'nestjs-zod';
import { CurrentOwner } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards.js';
import { EditedAt } from '../common/edited-at.decorator.js';
import { AttachmentService } from './attachment.service.js';
import {
  AttachmentDto,
  SetCampgroundMapDto,
  UploadAttachmentDto,
} from './trips.dto.js';

/** The slice of multer's file we consume — typed locally, no `@types/multer` dependency. */
interface MultipartFile {
  readonly originalname: string;
  readonly mimetype: string;
  readonly buffer: Buffer;
}

/**
 * Attachment endpoints (ADR-0026, issue #113). Every route is behind the JWT
 * guard and scoped to the authenticated owner (ADR-0003) via the stop's
 * trip's rig. Upload hangs off the stop (an attachment is born onto one);
 * everything else addresses the attachment directly, like stops under trips.
 * There is no list route — stop reads embed the metadata. Bytes only ever
 * move through upload and download, proxied — no presigned URLs (ADR-0007).
 */
@UseGuards(JwtAuthGuard)
@Controller()
export class AttachmentController {
  constructor(private readonly attachments: AttachmentService) {}

  /**
   * Keep a file on a stop: multipart, a `file` field plus the optional text
   * fields `id` and `isCampgroundMap` (issue #143) — an offline capture brings
   * its own id so a Background-Sync replay lands on one row, and flags itself
   * the campground map in the same request. Multer's memory storage caps the
   * read at the 15 MB limit (a 413 before the service is reached); the service
   * re-validates size and type.
   *
   * `stopId` stays the route parameter and `rigId` stays server-derived: a
   * client-supplied id names the new row, never its parents.
   */
  @Post('stops/:stopId/attachments')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: maxAttachmentSizeBytes } }),
  )
  @ZodSerializerDto(AttachmentDto)
  upload(
    @CurrentOwner() owner: Owner,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @Body() body: UploadAttachmentDto,
    @UploadedFile() file?: MultipartFile,
    @EditedAt() editedAt?: Date,
  ): Promise<Attachment> {
    if (!file) {
      throw new BadRequestException('Expected a multipart "file" field');
    }
    return this.attachments.upload(
      owner.id,
      stopId,
      {
        filename: file.originalname,
        mimeType: file.mimetype,
        content: file.buffer,
      },
      {
        ...(body.id !== undefined && { id: body.id }),
        ...(body.isCampgroundMap !== undefined && {
          isCampgroundMap: body.isCampgroundMap,
        }),
        ...(editedAt !== undefined && { editedAt }),
      },
    );
  }

  /** Stream the original bytes back with the stored Content-Type and filename. */
  @Get('attachments/:id')
  async download(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StreamableFile> {
    const { attachment, body } = await this.attachments.download(owner.id, id);
    const asciiFallback = attachment.filename.replaceAll(/["\\\r\n]/g, '_');
    return new StreamableFile(body, {
      type: attachment.mimeType,
      length: attachment.sizeBytes,
      disposition: `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,
    });
  }

  /**
   * Flag (or unflag) the stop's campground map — at most one per stop,
   * flagging swaps. A set write, so LWW-gated by `X-Edited-At` (issue #141).
   */
  @Post('attachments/:id/campground-map')
  @HttpCode(200)
  @ZodSerializerDto(AttachmentDto)
  setCampgroundMap(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetCampgroundMapDto,
    @EditedAt() editedAt?: Date,
  ): Promise<Attachment> {
    return this.attachments.setCampgroundMap(
      owner.id,
      id,
      body.isCampgroundMap,
      editedAt,
    );
  }

  /** Hard-delete an attachment — its object goes with it (ADR-0026, no retention). */
  @Delete('attachments/:id')
  @HttpCode(204)
  remove(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.attachments.remove(owner.id, id);
  }
}

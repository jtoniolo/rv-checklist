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
import { AttachmentService } from './attachment.service.js';
import { AttachmentDto, SetCampgroundMapDto } from './trips.dto.js';

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
   * Keep a file on a stop: multipart, single `file` field. Multer's memory
   * storage caps the read at the 15 MB limit (a 413 before the service is
   * reached); the service re-validates size and type.
   */
  @Post('stops/:stopId/attachments')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: maxAttachmentSizeBytes } }),
  )
  @ZodSerializerDto(AttachmentDto)
  upload(
    @CurrentOwner() owner: Owner,
    @Param('stopId', ParseUUIDPipe) stopId: string,
    @UploadedFile() file?: MultipartFile,
  ): Promise<Attachment> {
    if (!file) {
      throw new BadRequestException('Expected a multipart "file" field');
    }
    return this.attachments.upload(owner.id, stopId, {
      filename: file.originalname,
      mimeType: file.mimetype,
      content: file.buffer,
    });
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

  /** Flag (or unflag) the stop's campground map — at most one per stop, flagging swaps. */
  @Post('attachments/:id/campground-map')
  @HttpCode(200)
  @ZodSerializerDto(AttachmentDto)
  setCampgroundMap(
    @CurrentOwner() owner: Owner,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetCampgroundMapDto,
  ): Promise<Attachment> {
    return this.attachments.setCampgroundMap(
      owner.id,
      id,
      body.isCampgroundMap,
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

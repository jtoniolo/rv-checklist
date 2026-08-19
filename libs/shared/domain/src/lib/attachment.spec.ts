import {
  AttachmentSchema,
  attachmentMimeTypes,
  maxAttachmentSizeBytes,
} from './attachment.js';

const id = '550e8400-e29b-41d4-a716-446655440000';
const stopId = '550e8400-e29b-41d4-a716-446655440001';

const map = {
  id,
  stopId,
  filename: 'algonquin-map.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 240_000,
  isCampgroundMap: true,
};

describe('AttachmentSchema', () => {
  it('parses a campground map', () => {
    expect(AttachmentSchema.parse(map)).toEqual(map);
  });

  it.each(attachmentMimeTypes)('accepts %s', (mimeType) => {
    expect(AttachmentSchema.safeParse({ ...map, mimeType }).success).toBe(true);
  });

  it('rejects a type outside the accepted set (ADR-0026)', () => {
    expect(
      AttachmentSchema.safeParse({ ...map, mimeType: 'image/svg+xml' }).success,
    ).toBe(false);
  });

  it('rejects a blank filename', () => {
    expect(AttachmentSchema.safeParse({ ...map, filename: '' }).success).toBe(
      false,
    );
  });

  it('rejects an empty file', () => {
    expect(AttachmentSchema.safeParse({ ...map, sizeBytes: 0 }).success).toBe(
      false,
    );
  });

  it('accepts a file exactly at the 15 MB cap and rejects one byte over', () => {
    expect(
      AttachmentSchema.safeParse({ ...map, sizeBytes: maxAttachmentSizeBytes })
        .success,
    ).toBe(true);
    expect(
      AttachmentSchema.safeParse({
        ...map,
        sizeBytes: maxAttachmentSizeBytes + 1,
      }).success,
    ).toBe(false);
  });
});

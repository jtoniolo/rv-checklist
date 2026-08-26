import { classifyAttachmentUploadStatus } from './outbox.js';

describe('classifyAttachmentUploadStatus', () => {
  it.each([200, 201, 204])('treats %i as success', (status) => {
    expect(classifyAttachmentUploadStatus(status)).toBe('success');
  });

  it('treats 401 as auth-required', () => {
    expect(classifyAttachmentUploadStatus(401)).toBe('auth-required');
  });

  it('treats 404 as retryable — "stop not found" while the stop has not synced up yet', () => {
    expect(classifyAttachmentUploadStatus(404)).toBe('retry');
  });

  it('treats 429 as retryable', () => {
    expect(classifyAttachmentUploadStatus(429)).toBe('retry');
  });

  it.each([500, 502, 503])('treats %i as retryable', (status) => {
    expect(classifyAttachmentUploadStatus(status)).toBe('retry');
  });

  it.each([400, 413])(
    'treats other 4xx (%i) as a permanent failure',
    (status) => {
      expect(classifyAttachmentUploadStatus(status)).toBe('failed');
    },
  );
});

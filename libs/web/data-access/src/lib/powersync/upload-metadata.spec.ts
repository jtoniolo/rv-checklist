import { parseUploadMetadata } from './upload-metadata.js';

describe('parseUploadMetadata', () => {
  it('reads editedAt and runStepOps out of a well-formed payload', () => {
    const ops = [{ stepId: 'step-1', state: 'complete' as const }];

    expect(
      parseUploadMetadata(
        JSON.stringify({
          editedAt: '2026-08-20T00:00:00.000Z',
          runStepOps: ops,
        }),
      ),
    ).toEqual({ editedAt: '2026-08-20T00:00:00.000Z', runStepOps: ops });
  });

  it('reads a payload carrying only editedAt', () => {
    expect(
      parseUploadMetadata(
        JSON.stringify({ editedAt: '2026-08-20T00:00:00.000Z' }),
      ),
    ).toEqual({ editedAt: '2026-08-20T00:00:00.000Z' });
  });

  it('degrades to {} when metadata is absent', () => {
    expect(parseUploadMetadata(undefined)).toEqual({});
  });

  it('degrades to {} on unparsable JSON', () => {
    expect(parseUploadMetadata('not json')).toEqual({});
  });

  it('degrades to {} on a JSON value that is not an object', () => {
    expect(parseUploadMetadata('42')).toEqual({});
    expect(parseUploadMetadata('null')).toEqual({});
    expect(parseUploadMetadata('[1,2]')).toEqual({});
  });

  it('ignores fields of the wrong shape rather than throwing', () => {
    expect(
      parseUploadMetadata(
        JSON.stringify({ editedAt: 123, runStepOps: 'nope' }),
      ),
    ).toEqual({});
  });
});

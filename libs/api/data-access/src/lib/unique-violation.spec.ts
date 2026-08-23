import { QueryFailedError } from 'typeorm';
import { isUniqueViolation } from './unique-violation.js';

/**
 * The signal every client-generated-id create leans on (issue #143). Getting
 * this wrong either swallows a real failure as a replay or turns a replay into
 * a 500, so both directions are pinned.
 */
describe('isUniqueViolation', () => {
  it('recognises the code TypeORM copies onto QueryFailedError', () => {
    const error = new QueryFailedError('INSERT ...', [], new Error('dup'));
    Object.assign(error, { code: '23505' });

    expect(isUniqueViolation(error)).toBe(true);
  });

  it('recognises the code nested under driverError', () => {
    const error = new QueryFailedError('INSERT ...', [], new Error('dup'));
    Object.assign(error, { driverError: { code: '23505' } });

    expect(isUniqueViolation(error)).toBe(true);
  });

  it('rejects another SQLSTATE — a foreign-key violation is not a replay', () => {
    const error = new QueryFailedError('INSERT ...', [], new Error('fk'));
    Object.assign(error, { code: '23503' });

    expect(isUniqueViolation(error)).toBe(false);
  });

  it('rejects errors carrying no code at all', () => {
    expect(isUniqueViolation(new Error('connection reset'))).toBe(false);
    // eslint-disable-next-line unicorn/no-null
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation('23505')).toBe(false);
  });
});

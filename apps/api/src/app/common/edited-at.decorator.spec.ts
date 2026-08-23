import { BadRequestException } from '@nestjs/common';
import { parseEditedAt } from './edited-at.decorator.js';

const now = new Date('2026-08-23T12:00:00.000Z');

describe('parseEditedAt — the X-Edited-At header contract (issue #141)', () => {
  it('returns undefined when the header is absent (the write behaves as today)', () => {
    expect(parseEditedAt(undefined, now)).toBeUndefined();
  });

  it('parses a past ISO-8601 date-time as-is', () => {
    const stamp = parseEditedAt('2026-08-23T11:59:00.000Z', now);
    expect(stamp).toEqual(new Date('2026-08-23T11:59:00.000Z'));
  });

  it('accepts an explicit UTC offset', () => {
    const stamp = parseEditedAt('2026-08-23T06:59:00-05:00', now);
    expect(stamp).toEqual(new Date('2026-08-23T11:59:00.000Z'));
  });

  it('clamps a future stamp to server now — never stored in the future', () => {
    expect(parseEditedAt('2026-08-23T12:05:00.000Z', now)).toEqual(now);
  });

  it.each([
    ['free text', 'yesterday'],
    ['a date without a time', '2026-08-23'],
    ['a missing offset', '2026-08-23T11:59:00'],
    ['an impossible time', '2026-08-23T99:99:99Z'],
    ['a unix epoch number', '1787788740'],
    ['an empty value', ''],
  ])('rejects %s with 400', (_label, value) => {
    expect(() => parseEditedAt(value, now)).toThrow(BadRequestException);
  });

  it('rejects a repeated header with 400', () => {
    expect(() =>
      parseEditedAt(['2026-08-23T11:59:00Z', '2026-08-23T11:58:00Z'], now),
    ).toThrow(BadRequestException);
  });
});

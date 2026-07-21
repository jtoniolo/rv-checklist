import { addMonths, dueStatus, latestPerformedOn } from './due-status.js';

describe('dueStatus — computed on read from last completion + interval (ADR-0005)', () => {
  it('is untracked with no interval, even when the task has been performed', () => {
    expect(dueStatus(undefined, '2026-01-15', '2026-07-21')).toEqual({
      kind: 'untracked',
    });
    expect(dueStatus(undefined, undefined, '2026-07-21')).toEqual({
      kind: 'untracked',
    });
  });

  it('is never-performed with an interval but no completion yet', () => {
    expect(dueStatus({ months: 12 }, undefined, '2026-07-21')).toEqual({
      kind: 'never-performed',
    });
  });

  // The boundary (issue #17): last done 2025-07-21, every 12 months ⇒ due on
  // 2026-07-21. The day before is ok, the day itself is due, the day after is
  // overdue.
  it('is ok strictly before the due date', () => {
    expect(dueStatus({ months: 12 }, '2025-07-21', '2026-07-20')).toEqual({
      kind: 'ok',
      lastPerformedOn: '2025-07-21',
      dueOn: '2026-07-21',
    });
  });

  it('is due on exactly the due date', () => {
    expect(dueStatus({ months: 12 }, '2025-07-21', '2026-07-21')).toEqual({
      kind: 'due',
      lastPerformedOn: '2025-07-21',
      dueOn: '2026-07-21',
    });
  });

  it('is overdue past the due date', () => {
    expect(dueStatus({ months: 12 }, '2025-07-21', '2026-07-22')).toEqual({
      kind: 'overdue',
      lastPerformedOn: '2025-07-21',
      dueOn: '2026-07-21',
    });
  });
});

describe('addMonths', () => {
  it('keeps the day when the target month has it', () => {
    expect(addMonths('2025-07-21', 12)).toBe('2026-07-21');
    expect(addMonths('2026-03-15', 1)).toBe('2026-04-15');
  });

  it('clamps to the end of a shorter month rather than rolling over', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2026-08-31', 1)).toBe('2026-09-30');
  });

  it('crosses a year boundary', () => {
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });
});

describe('latestPerformedOn', () => {
  it('is undefined with no entries', () => {
    expect(latestPerformedOn([])).toBeUndefined();
  });

  it('picks the newest performed-on date regardless of order', () => {
    expect(
      latestPerformedOn([
        { performedOn: '2026-03-01' },
        { performedOn: '2026-07-04' },
        { performedOn: '2025-12-31' },
      ]),
    ).toBe('2026-07-04');
  });
});

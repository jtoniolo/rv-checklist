import { formatCentimeters, formatMeters } from './dimensions';

describe('dimension formatting (issue #139)', () => {
  it('shows metres to two decimals with feet-and-inches rounded up', () => {
    // 4110 mm = 161.81 in — rounds up to 162 in = 13 ft 6 in.
    expect(formatMeters(4110)).toBe('4.11 m (13 ft 6 in)');
  });

  it('drops a zero-inch remainder', () => {
    // 8530 mm = 335.83 in — rounds up to 336 in = exactly 28 ft.
    expect(formatMeters(8530)).toBe('8.53 m (28 ft)');
  });

  it('does not round up an exact inch', () => {
    // 6096 mm is exactly 240 in — rounding up must not add an inch.
    expect(formatMeters(6096)).toBe('6.10 m (20 ft)');
  });

  it('shows whole centimetres with inches rounded up', () => {
    // 900 mm = 35.43 in — rounds up to 36 in.
    expect(formatCentimeters(900)).toBe('90 cm (36 in)');
  });

  it('shows a sub-foot clearance in inches only', () => {
    // 150 mm = 5.9 in — rounds up to 6 in.
    expect(formatCentimeters(150)).toBe('15 cm (6 in)');
  });
});

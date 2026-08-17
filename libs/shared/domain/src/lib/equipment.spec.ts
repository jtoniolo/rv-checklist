import {
  CreateEquipmentItemSchema,
  EquipmentItemSchema,
  UpdateEquipmentItemSchema,
} from './equipment.js';

const id = '550e8400-e29b-41d4-a716-446655440000';
const rigId = '550e8400-e29b-41d4-a716-446655440001';

const full = {
  id,
  rigId,
  name: 'Onan generator',
  make: 'Onan',
  model: 'QG 5500',
  purchaseDate: '2024-03-15',
  notes: '5-year warranty',
  costCents: 389_900,
};

describe('EquipmentItemSchema', () => {
  it('parses a fully-detailed item', () => {
    expect(EquipmentItemSchema.parse(full)).toEqual(full);
  });

  it('parses a name-only item (all detail fields absent)', () => {
    const nameOnly = { id, rigId, name: 'Solar panel' };
    expect(EquipmentItemSchema.parse(nameOnly)).toEqual(nameOnly);
  });

  it('rejects a negative costCents', () => {
    expect(
      EquipmentItemSchema.safeParse({ ...full, costCents: -1 }).success,
    ).toBe(false);
  });

  it('rejects a non-integer costCents', () => {
    expect(
      EquipmentItemSchema.safeParse({ ...full, costCents: 99.5 }).success,
    ).toBe(false);
  });

  it('rejects an invalid purchaseDate', () => {
    expect(
      EquipmentItemSchema.safeParse({ ...full, purchaseDate: 'not-a-date' })
        .success,
    ).toBe(false);
  });

  it('rejects a blank name', () => {
    expect(EquipmentItemSchema.safeParse({ ...full, name: '' }).success).toBe(
      false,
    );
  });

  it('rejects a blank make (must be min 1 char or absent)', () => {
    expect(EquipmentItemSchema.safeParse({ ...full, make: '' }).success).toBe(
      false,
    );
  });
});

describe('CreateEquipmentItemSchema', () => {
  it('accepts a name-only create body', () => {
    expect(CreateEquipmentItemSchema.parse({ rigId, name: 'Battery' })).toEqual(
      { rigId, name: 'Battery' },
    );
  });

  it('accepts a create body with all detail fields', () => {
    const { id: _id, ...body } = full;
    expect(CreateEquipmentItemSchema.parse(body)).toEqual(body);
  });
});

describe('UpdateEquipmentItemSchema', () => {
  it('accepts an empty update (no fields changed)', () => {
    expect(UpdateEquipmentItemSchema.parse({})).toEqual({});
  });

  it('accepts null to clear a field', () => {
    // eslint-disable-next-line unicorn/no-null
    const update = { make: null, costCents: null };
    expect(UpdateEquipmentItemSchema.parse(update)).toEqual(update);
  });

  it('accepts a value to set a field', () => {
    const update = { make: 'Onan', costCents: 100 };
    expect(UpdateEquipmentItemSchema.parse(update)).toEqual(update);
  });

  it('rejects a blank name', () => {
    expect(UpdateEquipmentItemSchema.safeParse({ name: '' }).success).toBe(
      false,
    );
  });
});

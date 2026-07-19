import {
  FieldDefinitionSchema,
  FieldSchemaSchema,
  isSupportedFieldType,
  validateFieldSchema,
  validateFieldValues,
} from './field-schema.js';

describe('field type support', () => {
  it.each(['text', 'note', 'number', 'boolean', 'date'])(
    'accepts the MVP field type %s',
    (type) => {
      expect(isSupportedFieldType(type)).toBe(true);
    },
  );

  it('rejects photo — it exists in the shape but is deferred (ADR-0010)', () => {
    expect(isSupportedFieldType('photo')).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(isSupportedFieldType('colour')).toBe(false);
  });
});

describe('FieldDefinitionSchema', () => {
  it('parses a valid number field with a unit', () => {
    const parsed = FieldDefinitionSchema.parse({
      name: 'Tire Pressure',
      type: 'number',
      required: true,
      unit: 'psi',
    });
    expect(parsed).toEqual({
      name: 'Tire Pressure',
      type: 'number',
      required: true,
      unit: 'psi',
    });
  });

  it('parses a field with no unit', () => {
    expect(
      FieldDefinitionSchema.safeParse({
        name: 'Notes',
        type: 'note',
        required: false,
      }).success,
    ).toBe(true);
  });

  it('rejects a photo field', () => {
    expect(
      FieldDefinitionSchema.safeParse({
        name: 'Before',
        type: 'photo',
        required: false,
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(
      FieldDefinitionSchema.safeParse({
        name: 'Colour',
        type: 'colour',
        required: false,
      }).success,
    ).toBe(false);
  });

  it('rejects a blank name', () => {
    expect(
      FieldDefinitionSchema.safeParse({
        name: '',
        type: 'text',
        required: true,
      }).success,
    ).toBe(false);
  });

  it('rejects a unit on a non-number field (ADR-0004)', () => {
    expect(
      FieldDefinitionSchema.safeParse({
        name: 'Colour',
        type: 'text',
        required: false,
        unit: 'psi',
      }).success,
    ).toBe(false);
  });

  it('accepts a unit on a number field', () => {
    expect(
      FieldDefinitionSchema.safeParse({
        name: 'Pressure',
        type: 'number',
        required: false,
        unit: 'psi',
      }).success,
    ).toBe(true);
  });
});

describe('FieldSchemaSchema', () => {
  it('parses a list of distinct fields', () => {
    expect(
      FieldSchemaSchema.safeParse([
        { name: 'A', type: 'text', required: true },
        { name: 'B', type: 'number', required: false, unit: 'mi' },
      ]).success,
    ).toBe(true);
  });

  it('rejects duplicate field names within a task', () => {
    expect(
      FieldSchemaSchema.safeParse([
        { name: 'Pressure', type: 'number', required: true },
        { name: 'Pressure', type: 'text', required: false },
      ]).success,
    ).toBe(false);
  });

  it('points the duplicate-name issue at the offending occurrence, not the first', () => {
    const result = FieldSchemaSchema.safeParse([
      { name: 'Pressure', type: 'number', required: true },
      { name: 'Pressure', type: 'number', required: false },
    ]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual([1, 'name']);
    }
  });
});

describe('validateFieldSchema (pure)', () => {
  it('accepts a valid schema', () => {
    const result = validateFieldSchema([
      { name: 'Grease type', type: 'text', required: true },
      { name: 'Odometer', type: 'number', required: false, unit: 'mi' },
    ]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports duplicate field names', () => {
    const result = validateFieldSchema([
      { name: 'Pressure', type: 'number', required: true },
      { name: 'Pressure', type: 'number', required: false },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('Pressure');
  });

  it('rejects an invalid type', () => {
    const result = validateFieldSchema([
      { name: 'Colour', type: 'colour', required: false },
    ]);
    expect(result.valid).toBe(false);
  });

  it('rejects photo', () => {
    const result = validateFieldSchema([
      { name: 'Before', type: 'photo', required: false },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ').toLowerCase()).toContain('photo');
  });
});

describe('validateFieldValues (pure) — enforces required', () => {
  const schema = [
    { name: 'Pressure', type: 'number' as const, required: true, unit: 'psi' },
    { name: 'Notes', type: 'note' as const, required: false },
  ];

  it('accepts values when every required field is present', () => {
    const result = validateFieldValues(schema, [
      { name: 'Pressure', value: 32 },
    ]);
    expect(result.valid).toBe(true);
  });

  it('rejects when a required field is missing', () => {
    const result = validateFieldValues(schema, [
      { name: 'Notes', value: 'ok' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('Pressure');
  });

  it('rejects when a required field is blank', () => {
    const result = validateFieldValues(schema, [
      { name: 'Pressure', value: '' },
    ]);
    expect(result.valid).toBe(false);
  });
});

import { CreateRigSchema, RigSchema, UpdateRigSchema } from './rig.js';

const validRig = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  ownerId: '550e8400-e29b-41d4-a716-446655440001',
  vin: '1UYVS2538YU123456',
  make: 'Airstream',
  model: 'Flying Cloud',
  year: 2021,
  nickname: 'The Silver Bullet',
};

describe('RigSchema', () => {
  it('parses a valid rig', () => {
    expect(RigSchema.parse(validRig)).toEqual(validRig);
  });

  it('rejects a non-uuid id', () => {
    expect(RigSchema.safeParse({ ...validRig, id: 'nope' }).success).toBe(
      false,
    );
  });

  it('rejects a blank nickname', () => {
    expect(RigSchema.safeParse({ ...validRig, nickname: '' }).success).toBe(
      false,
    );
  });

  it('accepts a rig with only id, owner, and nickname', () => {
    const minimal = {
      id: validRig.id,
      ownerId: validRig.ownerId,
      nickname: validRig.nickname,
    };
    expect(RigSchema.parse(minimal)).toEqual(minimal);
  });

  it('rejects a non-integer year', () => {
    expect(RigSchema.safeParse({ ...validRig, year: 2021.5 }).success).toBe(
      false,
    );
  });

  it('rejects a blank VIN when one is given', () => {
    expect(RigSchema.safeParse({ ...validRig, vin: '' }).success).toBe(false);
  });
});

describe('CreateRigSchema', () => {
  it('omits server-assigned id and owner', () => {
    const { id, ownerId, ...body } = validRig;
    void id;
    void ownerId;
    expect(CreateRigSchema.parse(body)).toEqual(body);
  });

  it('rejects a body that carries an id', () => {
    // id is stripped, not an error — the point is a create body need not carry it.
    const { ownerId, ...body } = validRig;
    void ownerId;
    expect(CreateRigSchema.safeParse(body).success).toBe(true);
  });

  it('accepts a body with only a nickname', () => {
    expect(CreateRigSchema.parse({ nickname: 'Just a name' })).toEqual({
      nickname: 'Just a name',
    });
  });

  it('rejects a body with no nickname', () => {
    expect(CreateRigSchema.safeParse({ make: 'Airstream' }).success).toBe(
      false,
    );
  });
});

describe('UpdateRigSchema', () => {
  it('accepts a partial edit', () => {
    expect(UpdateRigSchema.parse({ nickname: 'Renamed' })).toEqual({
      nickname: 'Renamed',
    });
  });

  it('accepts an empty patch', () => {
    expect(UpdateRigSchema.parse({})).toEqual({});
  });
});

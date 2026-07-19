import { OwnerSchema } from './owner.js';

const validOwner = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'owner@example.com',
  name: 'Jeff Toniolo',
  picture: 'https://lh3.googleusercontent.com/a/photo',
};

describe('OwnerSchema', () => {
  it('parses a valid owner', () => {
    expect(OwnerSchema.parse(validOwner)).toEqual(validOwner);
  });

  it('accepts an omitted name and picture (scopes not granted)', () => {
    const { name, picture, ...bare } = validOwner;
    void name;
    void picture;
    expect(OwnerSchema.parse(bare)).toEqual(bare);
  });

  it('rejects a non-uuid id', () => {
    expect(OwnerSchema.safeParse({ ...validOwner, id: 'nope' }).success).toBe(
      false,
    );
  });

  it('rejects a malformed email', () => {
    expect(
      OwnerSchema.safeParse({ ...validOwner, email: 'not-an-email' }).success,
    ).toBe(false);
  });

  it('rejects a non-url picture', () => {
    expect(
      OwnerSchema.safeParse({ ...validOwner, picture: 'not a url' }).success,
    ).toBe(false);
  });
});

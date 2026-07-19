import { GoogleLoginSchema, RefreshSchema, TokenPairSchema } from './auth.js';

describe('GoogleLoginSchema', () => {
  it('parses a login body carrying an id token', () => {
    expect(GoogleLoginSchema.parse({ idToken: 'header.payload.sig' })).toEqual({
      idToken: 'header.payload.sig',
    });
  });

  it('rejects an empty id token', () => {
    expect(GoogleLoginSchema.safeParse({ idToken: '' }).success).toBe(false);
  });
});

describe('RefreshSchema', () => {
  it('parses a refresh body', () => {
    expect(RefreshSchema.parse({ refreshToken: 'abc' })).toEqual({
      refreshToken: 'abc',
    });
  });

  it('rejects a missing refresh token', () => {
    expect(RefreshSchema.safeParse({}).success).toBe(false);
  });
});

describe('TokenPairSchema', () => {
  const pair = {
    accessToken: 'a.b.c',
    refreshToken: 'refresh-opaque',
    expiresIn: 900,
  };

  it('parses a valid token pair', () => {
    expect(TokenPairSchema.parse(pair)).toEqual(pair);
  });

  it('rejects a non-positive expiresIn', () => {
    expect(TokenPairSchema.safeParse({ ...pair, expiresIn: 0 }).success).toBe(
      false,
    );
  });
});

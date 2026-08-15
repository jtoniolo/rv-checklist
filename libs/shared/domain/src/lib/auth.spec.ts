import { GoogleLoginSchema } from './auth.js';

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

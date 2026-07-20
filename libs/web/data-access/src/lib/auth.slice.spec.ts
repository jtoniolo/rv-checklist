import {
  authReducer,
  selectAccessToken,
  selectIsAuthenticated,
  selectRefreshToken,
  signedOut,
  tokensReceived,
} from './auth.slice.js';

const pair = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresIn: 900,
};

describe('auth slice', () => {
  it('starts signed out', () => {
    const state = authReducer(undefined, { type: '@@init' });
    expect(state).toEqual({ accessToken: undefined, refreshToken: undefined });
  });

  it('stores the token pair when tokens are received', () => {
    const state = authReducer(undefined, tokensReceived(pair));
    expect(state).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
    });
  });

  it('replaces the pair on a later refresh', () => {
    const first = authReducer(undefined, tokensReceived(pair));
    const rotated = authReducer(
      first,
      tokensReceived({
        accessToken: 'access-2',
        refreshToken: 'refresh-2',
        expiresIn: 900,
      }),
    );
    expect(rotated).toEqual({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
    });
  });

  it('forgets the pair on sign-out', () => {
    const signedIn = authReducer(undefined, tokensReceived(pair));
    expect(authReducer(signedIn, signedOut())).toEqual({
      accessToken: undefined,
      refreshToken: undefined,
    });
  });

  it('reports authentication from the presence of a refresh token', () => {
    const signedIn = { auth: authReducer(undefined, tokensReceived(pair)) };
    const signedOutState = { auth: authReducer(undefined, { type: '@@init' }) };
    expect(selectIsAuthenticated(signedIn)).toBe(true);
    expect(selectIsAuthenticated(signedOutState)).toBe(false);
    expect(selectAccessToken(signedIn)).toBe('access-1');
    expect(selectRefreshToken(signedIn)).toBe('refresh-1');
  });
});

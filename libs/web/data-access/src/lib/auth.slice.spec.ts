import {
  authReducer,
  selectIsAuthenticated,
  signedIn,
  signedOut,
} from './auth.slice.js';

describe('auth slice', () => {
  it('starts signed out', () => {
    const state = authReducer(undefined, { type: '@@init' });
    expect(state).toEqual({ isAuthenticated: false });
  });

  it('becomes authenticated on signedIn', () => {
    const state = authReducer(undefined, signedIn());
    expect(state).toEqual({ isAuthenticated: true });
  });

  it('forgets the session on signedOut', () => {
    const signedInState = authReducer(undefined, signedIn());
    expect(authReducer(signedInState, signedOut())).toEqual({
      isAuthenticated: false,
    });
  });

  it('reports authentication via the selector', () => {
    expect(selectIsAuthenticated({ auth: { isAuthenticated: true } })).toBe(
      true,
    );
    expect(selectIsAuthenticated({ auth: { isAuthenticated: false } })).toBe(
      false,
    );
  });
});

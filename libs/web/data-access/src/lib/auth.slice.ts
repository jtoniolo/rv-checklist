import { createSlice } from '@reduxjs/toolkit';

/**
 * The client-local session (ADR-0011, ADR-0019). With httpOnly cookies the
 * browser no longer holds tokens — this slice tracks only whether the user is
 * signed in (the server set cookies) or signed out (the server cleared them).
 * It is the single runtime source of truth the UI reads to show the signed-in
 * or signed-out surface. Cookie state itself is invisible to JavaScript.
 */
export interface AuthState {
  isAuthenticated: boolean;
}

export interface AuthRoot {
  auth: AuthState;
}

const initialState: AuthState = {
  isAuthenticated: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    signedIn(state) {
      state.isAuthenticated = true;
    },
    signedOut(state) {
      state.isAuthenticated = false;
    },
  },
});

export const authReducer = authSlice.reducer;
export const { signedIn, signedOut } = authSlice.actions;

export const selectIsAuthenticated = (state: AuthRoot): boolean =>
  state.auth.isAuthenticated;

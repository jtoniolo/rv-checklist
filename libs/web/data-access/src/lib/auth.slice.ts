import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TokenPair } from '@rv-checklist/domain';

/**
 * The client-local session (ADR-0011: a plain RTK slice for state that lives
 * nowhere on the server). It holds the first-party token pair (ADR-0002): the
 * access token is the bearer RTK Query attaches to every request, and the
 * refresh token renews it. This slice is the single runtime source of truth for
 * the session — `prepareHeaders` and the re-auth base query read the tokens from
 * here via `getState`; localStorage is only its persistence, hydrated on boot
 * and written back on change.
 */
export interface AuthState {
  accessToken: string | undefined;
  refreshToken: string | undefined;
}

/** Any store whose state contains the auth slice — the shape its selectors need. */
export interface AuthRoot {
  auth: AuthState;
}

const initialState: AuthState = {
  accessToken: undefined,
  refreshToken: undefined,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /** A fresh token pair arrived (sign-in or silent refresh). */
    tokensReceived(state, action: PayloadAction<TokenPair>) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
    },
    /** The session ended (sign-out, or an unrecoverable refresh failure). */
    signedOut(state) {
      state.accessToken = undefined;
      state.refreshToken = undefined;
    },
  },
});

export const authReducer = authSlice.reducer;
export const { tokensReceived, signedOut } = authSlice.actions;

export const selectAccessToken = (state: AuthRoot): string | undefined =>
  state.auth.accessToken;
export const selectRefreshToken = (state: AuthRoot): string | undefined =>
  state.auth.refreshToken;
/** Signed in as far as the client can tell — a refresh token means a live session. */
export const selectIsAuthenticated = (state: AuthRoot): boolean =>
  state.auth.refreshToken !== undefined;

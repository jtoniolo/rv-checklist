import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

/**
 * The colour themes the owner can pick from (issue #22 — the "Ontario Parks,
 * 1978" palettes). The keys live here because the *preference* is client-local
 * state (ADR-0011); the palettes themselves are styling and live with the web
 * app's CSS tokens. `algonquin` won the prototype bake-off as the default.
 */
export const THEME_KEYS = [
  'navy',
  'parksign',
  'campfire',
  'forest',
  'algonquin',
] as const;
export type ThemeKey = (typeof THEME_KEYS)[number];

export const DEFAULT_THEME_KEY: ThemeKey = 'algonquin';

/** Whether a persisted / external value names a known theme. */
export function isThemeKey(value: unknown): value is ThemeKey {
  return (THEME_KEYS as readonly unknown[]).includes(value);
}

/**
 * The selected theme (ADR-0011: client-local state — a pure presentation
 * preference that exists nowhere on the server). Persisted to localStorage the
 * same way as the session and the active rig, so the owner's pick survives a
 * reload.
 */
export interface ThemeState {
  themeKey: ThemeKey;
}

/** Any store whose state contains the theme slice. */
export interface ThemeRoot {
  theme: ThemeState;
}

const initialState: ThemeState = { themeKey: DEFAULT_THEME_KEY };

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    /** Switch to another theme (picked in the avatar menu). */
    themeSelected(state, action: PayloadAction<ThemeKey>) {
      state.themeKey = action.payload;
    },
  },
});

export const themeReducer = themeSlice.reducer;
export const { themeSelected } = themeSlice.actions;

export const selectThemeKey = (state: ThemeRoot): ThemeKey =>
  state.theme.themeKey;

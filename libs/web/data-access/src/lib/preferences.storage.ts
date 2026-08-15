import { storage } from './storage.js';
import {
  DEFAULT_THEME_KEY,
  isThemeKey,
  type ThemeState,
} from './theme.slice.js';

/**
 * localStorage persistence for the owner's client-local preferences (ADR-0011):
 * the picked theme. The slice is the runtime source of truth; the store
 * hydrates its `preloadedState` from here on boot and mirrors every change
 * back, so a reload resumes where the owner left off. SSR-safe: with no
 * `localStorage` (the server) it reads defaults and writes nothing.
 *
 * Active-rig persistence was removed in favour of rig-scoped URL routes
 * (ADR-0018); the `rv.last-rig` cookie redirect in root page.tsx is the
 * replacement.
 */
const THEME_KEY = 'rv.theme';

/** The persisted theme, or the default when none / unknown / not in a browser. */
export function loadPersistedTheme(): ThemeState {
  const raw = storage()?.getItem(THEME_KEY);
  // An unknown value (a renamed or retired theme) falls back to the default
  // rather than poisoning the store with a key no palette matches.
  return { themeKey: isThemeKey(raw) ? raw : DEFAULT_THEME_KEY };
}

/** Mirror the picked theme to localStorage. */
export function persistTheme(theme: ThemeState): void {
  const store = storage();
  if (store) {
    store.setItem(THEME_KEY, theme.themeKey);
  }
}

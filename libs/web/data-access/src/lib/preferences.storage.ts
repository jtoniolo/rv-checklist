import type { ActiveRigState } from './active-rig.slice.js';
import { setOrRemove, storage } from './storage.js';
import {
  DEFAULT_THEME_KEY,
  isThemeKey,
  type ThemeState,
} from './theme.slice.js';

/**
 * localStorage persistence for the owner's client-local preferences (ADR-0011):
 * the picked theme and the active rig. Same shape as `auth.storage.ts` — the
 * slices are the runtime source of truth; the store hydrates its
 * `preloadedState` from here on boot and mirrors every change back, so a reload
 * resumes where the owner left off. SSR-safe: with no `localStorage` (the
 * server) it reads defaults and writes nothing.
 */
const THEME_KEY = 'rv.theme';
const ACTIVE_RIG_KEY = 'rv.activeRigId';

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

/** The persisted active rig, or no selection when none / not in a browser. */
export function loadPersistedActiveRig(): ActiveRigState {
  return { activeRigId: storage()?.getItem(ACTIVE_RIG_KEY) ?? undefined };
}

/** Mirror the active rig to localStorage (clearing the key when none). */
export function persistActiveRig(activeRig: ActiveRigState): void {
  const store = storage();
  if (store) {
    setOrRemove(store, ACTIVE_RIG_KEY, activeRig.activeRigId);
  }
}

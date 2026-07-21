import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { activeRigReducer } from './active-rig.slice.js';
import { api } from './api.js';
import { authReducer } from './auth.slice.js';
import { loadPersistedAuth, persistAuth } from './auth.storage.js';
import {
  loadPersistedActiveRig,
  loadPersistedTheme,
  persistActiveRig,
  persistTheme,
} from './preferences.storage.js';
import { themeReducer } from './theme.slice.js';

/**
 * Build the web app's Redux store (ADR-0011). RTK Query's reducer and middleware
 * own all server state; the plain `auth`, `activeRig`, and `theme` slices hold
 * the client-local state. The store hydrates the session and the owner's
 * preferences from localStorage and mirrors them back on every change, so a
 * reload resumes the session, the picked theme, and the active rig, and a
 * silent token rotation is never lost. A fresh store is created per client
 * (`makeStore`) rather than shared as a module singleton.
 */
export function makeStore() {
  const store = configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
      auth: authReducer,
      activeRig: activeRigReducer,
      theme: themeReducer,
    },
    preloadedState: {
      auth: loadPersistedAuth(),
      activeRig: loadPersistedActiveRig(),
      theme: loadPersistedTheme(),
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(api.middleware),
  });

  // Enable refetchOnFocus / refetchOnReconnect behaviours.
  setupListeners(store.dispatch);

  // Persist the session and preferences whenever they change.
  store.subscribe(() => {
    const state = store.getState();
    persistAuth(state.auth);
    persistActiveRig(state.activeRig);
    persistTheme(state.theme);
  });

  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

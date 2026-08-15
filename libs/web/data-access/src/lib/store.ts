import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { activeRigReducer } from './active-rig.slice.js';
import { api } from './api.js';
import { authReducer } from './auth.slice.js';
import {
  loadPersistedActiveRig,
  loadPersistedTheme,
  persistActiveRig,
  persistTheme,
} from './preferences.storage.js';
import { themeReducer } from './theme.slice.js';

/**
 * Build the web app's Redux store (ADR-0011, ADR-0019). RTK Query's reducer
 * and middleware own all server state; the plain `auth`, `activeRig`, and
 * `theme` slices hold the client-local state. The auth slice no longer persists
 * tokens — session presence is derived from the httpOnly cookies the browser
 * sends automatically. A fresh store is created per client (`makeStore`) rather
 * than shared as a module singleton.
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
      activeRig: loadPersistedActiveRig(),
      theme: loadPersistedTheme(),
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(api.middleware),
  });

  setupListeners(store.dispatch);

  store.subscribe(() => {
    const state = store.getState();
    persistActiveRig(state.activeRig);
    persistTheme(state.theme);
  });

  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

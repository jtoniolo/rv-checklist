import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { activeRigReducer } from './active-rig.slice.js';
import { api } from './api.js';
import { authReducer } from './auth.slice.js';
import { loadPersistedAuth, persistAuth } from './auth.storage.js';

/**
 * Build the web app's Redux store (ADR-0011). RTK Query's reducer and middleware
 * own all server state; the plain `auth` and `activeRig` slices hold the two
 * pieces of client-local state. The store hydrates the session from localStorage
 * and mirrors it back on every change, so a reload resumes the session and a
 * silent token rotation is never lost. A fresh store is created per client
 * (`makeStore`) rather than shared as a module singleton.
 */
export function makeStore() {
  const store = configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
      auth: authReducer,
      activeRig: activeRigReducer,
    },
    preloadedState: { auth: loadPersistedAuth() },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(api.middleware),
  });

  // Enable refetchOnFocus / refetchOnReconnect behaviours.
  setupListeners(store.dispatch);

  // Persist the session whenever it changes (sign-in, refresh, sign-out).
  store.subscribe(() => {
    persistAuth(store.getState().auth);
  });

  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

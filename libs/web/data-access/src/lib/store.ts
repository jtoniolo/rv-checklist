import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { api } from './api.js';
import { authReducer } from './auth.slice.js';
import { loadPersistedTheme, persistTheme } from './preferences.storage.js';
import { themeReducer } from './theme.slice.js';

/**
 * Build the web app's Redux store (ADR-0011, ADR-0019). RTK Query's reducer
 * and middleware own all server state; the plain `auth` and `theme` slices hold
 * the client-local state. The auth slice no longer persists tokens — session
 * presence is derived from the httpOnly cookies the browser sends
 * automatically. A fresh store is created per client (`makeStore`) rather than
 * shared as a module singleton.
 */
export function makeStore() {
  const store = configureStore({
    reducer: {
      [api.reducerPath]: api.reducer,
      auth: authReducer,
      theme: themeReducer,
    },
    preloadedState: {
      theme: loadPersistedTheme(),
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(api.middleware),
  });

  setupListeners(store.dispatch);

  store.subscribe(() => {
    persistTheme(store.getState().theme);
  });

  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];

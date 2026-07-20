'use client';

import { makeStore, type AppStore } from '@rv-checklist/web-data-access';
import { useRef, type JSX, type ReactNode } from 'react';
import { Provider } from 'react-redux';

/**
 * Mounts the Redux store for the app (ADR-0011). The store is created once per
 * client via a ref (never re-created on re-render, and never shared across
 * requests as a module singleton), and hydrates the session from localStorage
 * as it is built.
 */
export function StoreProvider({
  children,
}: {
  readonly children: ReactNode;
}): JSX.Element {
  const storeRef = useRef<AppStore | undefined>(undefined);
  storeRef.current ??= makeStore();
  return <Provider store={storeRef.current}>{children}</Provider>;
}

import { useEffect, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import type { AppDispatch, AppStore, RootState } from './store.js';

/**
 * Pre-typed react-redux hooks (the recommended pattern) so components never
 * re-annotate the store's types.
 */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export const useAppStore = useStore.withTypes<AppStore>();

/**
 * `false` during the server render and the first client render, `true` once the
 * component has mounted in the browser.
 *
 * The session is cookie-based (ADR-0019), invisible to JavaScript. On the
 * server the auth slice starts unsigned-in; after mount the client fires a `/me`
 * probe or waits for the first authenticated fetch. Gate auth-dependent UI
 * behind this hook so server and first client render agree on a neutral
 * placeholder, avoiding a hydration mismatch.
 */
export function useHasHydrated(): boolean {
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    setIsHydrated(true);
  }, []);
  return isHydrated;
}

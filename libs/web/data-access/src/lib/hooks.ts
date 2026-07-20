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
 * The session lives in localStorage (see `auth.storage.ts`), which the server
 * cannot see — so the store is signed-out on the server and signed-in on the
 * client. Rendering auth-dependent UI straight from that state makes the server
 * and first client render disagree, a hydration mismatch that flashes the
 * signed-out sign-in surface (and fires Google One Tap, re-authenticating the
 * owner) on every reload. Gate that UI behind this hook so both renders agree on
 * a neutral placeholder first, then reveal the real session after mount.
 */
export function useHasHydrated(): boolean {
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    setIsHydrated(true);
  }, []);
  return isHydrated;
}

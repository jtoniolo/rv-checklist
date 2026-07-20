'use client';

import {
  selectIsAuthenticated,
  useAppSelector,
  useHasHydrated,
} from '@rv-checklist/web-data-access';
import type { JSX } from 'react';
import { AuthPanel, authCardClass } from './auth-panel';
import { RigManager } from './rig-manager';

/**
 * The home content. The session is restored from localStorage, which the server
 * cannot see, so the auth surface is gated on {@link useHasHydrated}: server and
 * first client render agree on a neutral placeholder, then the real session is
 * revealed. Without this gate the signed-out sign-in surface (and Google One
 * Tap) flashes on every reload, re-authenticating an already signed-in owner.
 * Once signed in it also shows the rig manager — the app's first feature (#14).
 */
export function Home(): JSX.Element {
  const isHydrated = useHasHydrated();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  if (!isHydrated) {
    return (
      <section className={authCardClass} aria-label="Loading">
        <p>Loading…</p>
      </section>
    );
  }

  return (
    <>
      <AuthPanel />
      {isAuthenticated ? <RigManager /> : undefined}
    </>
  );
}

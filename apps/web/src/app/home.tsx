'use client';

import {
  selectIsAuthenticated,
  useAppSelector,
} from '@rv-checklist/web-data-access';
import type { JSX } from 'react';
import { AuthPanel } from './auth-panel';
import { RigManager } from './rig-manager';

/**
 * The signed-in home content. Always shows the auth panel; once signed in it
 * also shows the rig manager — the app's first real feature (issue #14).
 */
export function Home(): JSX.Element {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  return (
    <>
      <AuthPanel />
      {isAuthenticated ? <RigManager /> : undefined}
    </>
  );
}

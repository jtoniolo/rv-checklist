'use client';

import {
  selectIsAuthenticated,
  selectRefreshToken,
  useAppSelector,
  useLogoutMutation,
  useMeQuery,
} from '@rv-checklist/web-data-access';
import type { JSX } from 'react';
import { disableGoogleAutoSelect, GoogleOneTap } from './google-one-tap';

/**
 * The sign-in surface (issue #13, reworked onto Redux in #14). Reads the session
 * from the store: signed out it offers Google One Tap; signed in it confirms the
 * owner from `GET /me` (RTK Query) and offers sign-out. The token lifecycle and
 * silent refresh live in the data-access layer, not here.
 */
const cardClass =
  'border-hairline text-brand-muted flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-8 text-center';

export function AuthPanel(): JSX.Element {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const refreshToken = useAppSelector(selectRefreshToken);
  const [logout] = useLogoutMutation();
  const { data: owner, isLoading } = useMeQuery(undefined, {
    skip: !isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <section className={cardClass} aria-label="Sign in">
        <p>Sign in with Google to continue.</p>
        <GoogleOneTap />
      </section>
    );
  }

  if (isLoading || !owner) {
    return (
      <section className={cardClass} aria-label="Signing in">
        <p>Checking your session…</p>
      </section>
    );
  }

  return (
    <section className={cardClass} aria-label="Signed in">
      <p>
        Signed in as{' '}
        <strong className="text-brand dark:text-ink-inverted">
          {owner.email}
        </strong>
        {owner.name ? ` (${owner.name})` : ''}
      </p>
      <button
        type="button"
        onClick={() => {
          disableGoogleAutoSelect();
          if (refreshToken) {
            void logout(refreshToken);
          }
        }}
        className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        Sign out
      </button>
    </section>
  );
}

'use client';

import type { JSX } from 'react';
import { useAuth } from './auth-provider';
import styles from './page.module.css';

/**
 * The sign-in surface (issue #13). Minimal by design — this slice is the
 * platform walking skeleton, not a feature. Shows the Google One Tap / sign-in
 * button when signed out, and the authenticated owner (fetched from `GET /me`)
 * when signed in, proving the whole auth path end to end.
 */
export function AuthPanel(): JSX.Element {
  const { status, owner, buttonRef, signOut } = useAuth();

  if (status === 'loading') {
    return (
      <section className={styles['placeholder']} aria-label="Signing in">
        <p>Checking your session…</p>
      </section>
    );
  }

  if (status === 'signed-in' && owner) {
    return (
      <section className={styles['placeholder']} aria-label="Signed in">
        <p>
          Signed in as <strong>{owner.email}</strong>
          {owner.name ? ` (${owner.name})` : ''}
        </p>
        <p>
          owner id: <code>{owner.id}</code>
        </p>
        <button type="button" onClick={signOut}>
          Sign out
        </button>
      </section>
    );
  }

  return (
    <section className={styles['placeholder']} aria-label="Sign in">
      <p>Sign in with Google to continue.</p>
      <div ref={buttonRef} />
    </section>
  );
}

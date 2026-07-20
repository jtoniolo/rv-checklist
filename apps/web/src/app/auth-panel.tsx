'use client';

import type { JSX } from 'react';
import { useAuth } from './auth-provider';

/**
 * The sign-in surface (issue #13). Minimal by design — this slice is the
 * platform walking skeleton, not a feature. Shows the Google One Tap / sign-in
 * button when signed out, and the authenticated owner (fetched from `GET /me`)
 * when signed in, proving the whole auth path end to end.
 */
const cardClass =
  'border-hairline text-brand-muted flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed p-8 text-center';

export function AuthPanel(): JSX.Element {
  const { status, owner, buttonRef, signOut } = useAuth();

  if (status === 'loading') {
    return (
      <section className={cardClass} aria-label="Signing in">
        <p>Checking your session…</p>
      </section>
    );
  }

  if (status === 'signed-in' && owner) {
    return (
      <section className={cardClass} aria-label="Signed in">
        <p>
          Signed in as{' '}
          <strong className="text-brand dark:text-ink-inverted">
            {owner.email}
          </strong>
          {owner.name ? ` (${owner.name})` : ''}
        </p>
        <p className="text-sm">
          owner id: <code className="font-mono">{owner.id}</code>
        </p>
        <button
          type="button"
          onClick={signOut}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Sign out
        </button>
      </section>
    );
  }

  return (
    <section className={cardClass} aria-label="Sign in">
      <p>Sign in with Google to continue.</p>
      <div ref={buttonRef} />
    </section>
  );
}

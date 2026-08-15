'use client';

import {
  selectIsAuthenticated,
  useAppSelector,
} from '@rv-checklist/web-data-access';
import { Page } from '@rv-checklist/web-ui';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, type JSX } from 'react';
import { GoogleOneTap } from '../google-one-tap';

/**
 * The signed-out welcome surface. Edge middleware redirects unauthenticated
 * requests here with `?returnTo=<original-path>`. Once the owner signs in
 * (via Google One Tap), the auth slice flips and this component navigates to
 * the preserved URL.
 */
export function WelcomeContent(): JSX.Element {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const searchParams = useSearchParams();
  const router = useRouter();
  const returnTo = searchParams.get('returnTo') ?? '/';

  useEffect(() => {
    if (isAuthenticated) {
      router.replace(returnTo);
    }
  }, [isAuthenticated, returnTo, router]);

  return (
    <Page>
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-brand lg:text-4xl dark:text-ink-inverted">
          RV Checklist
        </h1>
        <p className="text-base text-brand-muted lg:text-lg">
          Maintenance &amp; packing, one rig at a time.
        </p>
      </header>
      <section
        className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-hairline p-8 text-center text-brand-muted"
        aria-label="Sign in"
      >
        <p>Sign in with Google to continue.</p>
        <GoogleOneTap />
      </section>
    </Page>
  );
}

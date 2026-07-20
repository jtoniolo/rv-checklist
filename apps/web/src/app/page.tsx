import { Page } from '@rv-checklist/web-ui';
import type { JSX } from 'react';
import { Home } from './home';

/**
 * The mobile-first landing surface, framed by the shared responsive `Page`
 * primitive (ADR-0013). The shell arrived in #11; #13 added sign-in; #14 adds
 * the first real feature — managing the owner's rigs once signed in.
 */
export default function Index(): JSX.Element {
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
      <Home />
    </Page>
  );
}

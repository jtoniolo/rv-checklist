import { Suspense, type JSX } from 'react';
import { WelcomeContent } from './welcome-content';

/**
 * Rendered per request, not prerendered, so the root layout's inline config
 * script carries this run's environment (ADR-0020). The sign-in button here
 * reads the Google client id from that script, and one published image must
 * serve it a different id per environment with no rebuild. The offline
 * fallback stays static — it needs no runtime config — so the worker build can
 * still precache it.
 */
export const dynamic = 'force-dynamic';

export default function WelcomePage(): JSX.Element {
  return (
    <Suspense>
      <WelcomeContent />
    </Suspense>
  );
}

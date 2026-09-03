'use client';

import { useEffect } from 'react';
import type { JSX } from 'react';
import { config } from '../lib/config';

/**
 * Registers the service worker (ADR-0028) — what makes the app installable and
 * what serves the visited pages off grid. Renders nothing.
 *
 * Registration is best-effort: if the browser has no service worker support, or
 * registration fails, the app still works online.
 *
 * Development deliberately has no worker. `/sw.js` is a build output whose
 * precache manifest describes one production build; served against the dev
 * server, its cache-first rule for `/_next/static/` would hand back yesterday's
 * chunks and fight every edit. So a dev page registers nothing, and clears
 * anything a previous build left registered on this origin.
 */
export function ServiceWorkerRegistrar(): JSX.Element {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    if (process.env.NODE_ENV !== 'production') {
      void unregisterAll();
      return;
    }

    // The worker reads the API base URL from its own registration URL
    // (ADR-0020): the published image is environment-blind, so the one place
    // the worker itself calls the API — the outbox flush — cannot rely on a
    // compile-time constant. The page, which does know the runtime value,
    // hands it over in the query string.
    const swUrl = config.apiBaseUrl
      ? `/sw.js?api=${encodeURIComponent(config.apiBaseUrl)}`
      : '/sw.js';

    const register = async (): Promise<void> => {
      try {
        await navigator.serviceWorker.register(swUrl);
      } catch {
        // Offline support is a progressive enhancement; ignore failures.
      }
    };
    if (document.readyState === 'complete') {
      void register();
      return;
    }
    const onLoad = (): void => {
      void register();
    };
    window.addEventListener('load', onLoad, { once: true });
    return (): void => {
      window.removeEventListener('load', onLoad);
    };
  }, []);

  return <></>;
}

async function unregisterAll(): Promise<void> {
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
  } catch {
    // Nothing to clean up, or the browser will not say — either way, carry on.
  }
}

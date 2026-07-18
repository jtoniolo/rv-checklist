'use client';

import { useEffect } from 'react';
import type { JSX } from 'react';

/**
 * Registers the (cache-nothing) service worker so the app is installable.
 * Renders nothing. Registration is best-effort: if the browser has no service
 * worker support, or registration fails, the app still works — it just isn't
 * installable in that environment.
 */
export function ServiceWorkerRegistrar(): JSX.Element {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    const register = async (): Promise<void> => {
      try {
        await navigator.serviceWorker.register('/sw.js');
      } catch {
        // Installability is a progressive enhancement; ignore failures.
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

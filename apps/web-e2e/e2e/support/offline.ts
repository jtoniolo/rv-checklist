import type { BrowserContext, Page } from '@playwright/test';

/**
 * Goes offline for the rest of the test, in the way the app's own offline
 * detection actually observes (issue #156).
 *
 * `context.setOffline(true)` blocks the network at the protocol level — real
 * offline behaviour, confirmed by `net::ERR_INTERNET_DISCONNECTED` — but on
 * headless Chromium it does not reliably flip `navigator.onLine` or fire the
 * `online`/`offline` DOM events, which is the *other* signal
 * `useIsOffline` reads (libs/web/data-access/src/lib/connectivity.ts) as its
 * fallback when the sync client's own connection state never got a chance to
 * connect. `addInitScript` overrides the getter for every navigation from
 * here on, so the fallback signal agrees with the network block a real
 * device would also present when it goes offline.
 */
export async function goOffline(
  page: Page,
  context: BrowserContext,
): Promise<void> {
  await context.setOffline(true);
  await page.addInitScript(() => {
    Object.defineProperty(globalThis.navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });
  });
}

/*
 * Service worker for the RV Checklist PWA shell.
 *
 * Its ONLY job is to exist so the app is installable (a registered service
 * worker plus a manifest is what makes "Add to Home Screen" available). It
 * caches NOTHING and intercepts no network traffic — offline support is
 * explicitly out of scope for the MVP (ADR-0010). There is intentionally no
 * `fetch` handler and no use of the Cache Storage API; every request goes
 * straight to the network as if no worker were present.
 *
 * `skipWaiting` + `clients.claim` just ensure a fresh empty worker takes over
 * promptly instead of leaving a stale one registered.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

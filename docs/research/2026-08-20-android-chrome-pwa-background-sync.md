# Background Sync in Android Chrome PWAs

**Question (issue #127):** What can an installed PWA on Android Chrome do while closed or backgrounded? What guarantees does "no manual sync ever" get?

**Date compiled:** 2026-08-20

**Sources:** Primary only — Chrome developer docs, WICG specs, MDN. Each claim cites its source. Claims marked *(platform reality, not spec)* are Android behaviors the specs permit but do not define.

---

## Summary

| Mechanism | Fires when app is closed? | Trigger | Guarantee level |
|---|---|---|---|
| One-shot Background Sync (`sync`) | Yes — service worker wakes | Connectivity regained | Strong: "SHOULD fire" on online transition; retries with backoff |
| Periodic Background Sync (`periodicsync`) | Yes — service worker wakes | Browser-chosen interval, >= 12 h per origin by default | Weak: best-effort, gated by site-engagement score |
| Web Push | Yes — service worker wakes | Server push | Chrome requires `userVisibleOnly: true` — a notification must be shown, so no silent data-only sync |
| In-page sync | No — app must be open | App launch/focus | Full control |

**Bottom line for rv-checklist:** Android Chrome gives a reliable **upload** guarantee (queued writes flush on reconnect via one-shot Background Sync, even with the app closed) and only a best-effort **download** cadence (Periodic Background Sync at >= 12 h intervals, and only while the app keeps a non-zero engagement score). Fresh data on open is guaranteed only by fetching at app launch. "No manual sync ever" is achievable: user opens app → pull latest; user edits offline → one-shot sync pushes on reconnect. What is *not* available is silent server-to-device push or a sub-12-hour background refresh.

---

## 1. One-shot Background Sync API (`SyncManager`, `sync` event)

### Registration requirements

- Secure context (HTTPS) + registered service worker; register via `registration.sync.register(tag)`. — [MDN: Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
- No user permission prompt: "background sync itself does not" require permission. — [Chrome: Introducing Background Sync](https://developer.chrome.com/blog/background-sync)
- Spec classifies it as a "default powerful feature" named `background-sync`, enabled by default; users *may* disable it. — [WICG Background Sync spec](https://wicg.github.io/background-sync/spec/)
- "You can only register for a sync event when the user has a window open to the site." — [Chrome blog](https://developer.chrome.com/blog/background-sync)
- No install requirement — works from any tab, installed or not.

### When it fires

- "Whenever the user agent changes to online, the user agent SHOULD fire a sync event for each sync registration whose registration state is pending." — [WICG spec](https://wicg.github.io/background-sync/spec/)
- Fires "when the user has connectivity, which is immediate if the user already has connectivity." — [Chrome blog](https://developer.chrome.com/blog/background-sync)
- Works with the page closed: "it uses a service worker as the event target, which enables it to work when the page isn't open." The spec's stated purpose is to complete the sync even when "the browser closes or the user navigates away." — [Chrome blog](https://developer.chrome.com/blog/background-sync), [WICG spec](https://wicg.github.io/background-sync/spec/)
- On Android, Chrome schedules the wake-up through the OS: Chromium uses Android's JobScheduler, and its background task scheduler wakes the browser process to run the service worker — a swiped-away PWA still gets its sync. Registrations persist in service worker storage across browser restarts. — [blink-dev Intent to Implement](https://groups.google.com/a/chromium.org/g/blink-dev/c/iaAyTxWmx7o), [Chromium background_task_scheduler](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/background_task_scheduler)
- *(platform reality, not spec)* If the user force-stops Chrome in Android settings, Android cancels the scheduled jobs until Chrome next runs; OEM battery managers can do the same. No web API survives Android force-stop. On desktop, Chrome must be running for the event to fire.

### Retry and limits

- On handler failure (rejected `waitUntil` promise): "Retry syncs also wait for connectivity and employ an exponential back-off." — [Chrome blog](https://developer.chrome.com/blog/background-sync)
- Retry count and delay are user-agent heuristics, not spec-mandated. `event.lastChance` is true on the final attempt; after a last-chance failure the registration is dropped. — [WICG spec](https://wicg.github.io/background-sync/spec/)
- Chrome's defaults (implementation, not spec): **3 attempts total**, initial retry delay 5 minutes, delay factor 3 (retries at ~+5 min, then ~+15 min), and a **3-minute cap** on the sync event's `waitUntil` (`kMaxSyncAttempts`, `kInitialRetryDelay`, `kRetryDelayFactor`, `kMaxSyncEventDuration`). — [Chromium background_sync_parameters.cc](https://chromium.googlesource.com/chromium/src/+/main/content/public/browser/background_sync_parameters.cc)
- Event execution time is capped: "you can't use them to ping a server every x seconds." Spec advises UAs to "cap the number of retries and duration of sync events." — [Chrome blog](https://developer.chrome.com/blog/background-sync), [WICG spec](https://wicg.github.io/background-sync/spec/)
- Note: attempts count handler *failures*, not offline time — the first event does not fire until connectivity returns. But if the server is down when the event runs, only 3 attempts (~20 minutes) are made; flush the outbox on every app launch and `online` event as the backstop.

### Payload constraints

- The API carries **tags only** — no data payload. Same-tag registrations coalesce into one event. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API), [Chrome blog](https://developer.chrome.com/blog/background-sync)
- Pending data must be persisted where the service worker can read it: "The page could store these in an 'outbox' store in indexedDB, and the service worker would retrieve them, and send them." — [Chrome blog](https://developer.chrome.com/blog/background-sync)

---

## 2. Periodic Background Sync API (`PeriodicSyncManager`, `periodicsync` event)

### Registration requirements

- Installed PWA only: "a web app can only use periodic background sync after a person has installed it on their device, and has launched it as a distinct application." Not available in regular tabs. Shipped in Chrome 80; the Intent to Ship confirms it "is not available outside of installed PWAs." — [Chrome: Periodic Background Sync](https://developer.chrome.com/docs/capabilities/periodic-background-sync), [blink-dev Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/KSJViFp3hMc/m/e-Yzd3_-AwAJ)
- Requires the `periodic-background-sync` permission to be `granted` (auto-granted for installed PWAs in Chrome; query it via the Permissions API). — [WICG Periodic Background Sync spec](https://wicg.github.io/periodic-background-sync/), [Chrome docs](https://developer.chrome.com/docs/capabilities/periodic-background-sync)
- Chromium-only in practice; MDN marks the API experimental and non-Baseline ("does not work in some of the most widely-used browsers"). — [MDN: Web Periodic Background Synchronization API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Periodic_Background_Synchronization_API)

### Frequency and limits

- `minInterval` is a floor and "a suggestion to the user agent"; actual interval "MUST be greater than or equal to this." — [WICG spec](https://wicg.github.io/periodic-background-sync/)
- The spec directs UAs to impose a per-origin minimum gap between events, **defaulting to 12 hours**, plus a cross-origin cap. Chromium hardcodes this: `kMinPeriodicSyncEventsInterval = base::Hours(12)` — at most ~1 event per 12 h per origin. — [WICG spec](https://wicg.github.io/periodic-background-sync/), [Chromium background_sync_parameters.cc](https://chromium.googlesource.com/chromium/src/+/main/content/public/browser/background_sync_parameters.cc)
- "Chrome is using a site engagement score to determine if and how often periodic background syncs can happen." "A `periodicsync` event won't be fired at all unless the engagement score is greater than zero, and its value affects the frequency." If the person stops interacting with the app, periodic sync stops triggering. — [Chrome docs](https://developer.chrome.com/docs/capabilities/periodic-background-sync)
- "The timing of synchronizations are not controlled by developers"; events fire at a time of the browser's choosing. — [Chrome docs](https://developer.chrome.com/docs/capabilities/periodic-background-sync)

### Conditions on firing

- Fires only when online; Chrome only syncs "on a network that the device has previously connected to" and "takes into account the device's power and connectivity state." — [Chrome docs](https://developer.chrome.com/docs/capabilities/periodic-background-sync); spec permits restricting to the registration-time network and considering Data Saver. — [WICG spec](https://wicg.github.io/periodic-background-sync/)
- On Android, Chrome "will not fire periodicsync events in doze mode... but rather will fire in the recurring maintenance window the OS allows to apps." — [blink-dev Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/KSJViFp3hMc/m/e-Yzd3_-AwAJ)
- Events are explicitly **not guaranteed** — conditional on permission, network, interval, and engagement. Treat as "roughly daily, best effort, only while the app stays in use." — [WICG spec](https://wicg.github.io/periodic-background-sync/)
- `periodicSync.unregister(tag)` stops future events. — [Chrome docs](https://developer.chrome.com/docs/capabilities/periodic-background-sync)

---

## 3. What still requires the app foregrounded (or a notification)

- **Registering** any sync requires an open window/launched app (one-shot: open tab; periodic: installed app launched at least once). — [Chrome blog](https://developer.chrome.com/blog/background-sync), [Chrome docs](https://developer.chrome.com/docs/capabilities/periodic-background-sync)
- **Silent push is not available in Chrome:** `PushManager.subscribe` requires `userVisibleOnly: true` — "They will reject the Promise if `userVisibleOnly` is not set to `true`." Every push must produce a user-visible notification, so push cannot be used as an invisible server-driven sync trigger. — [MDN: PushManager.subscribe](https://developer.mozilla.org/en-US/docs/Web/API/PushManager/subscribe)
- **On-demand freshness** (seeing the latest data the moment the app opens) requires an in-page fetch at launch — no background API guarantees data is fresh at open time.
- Sync-event execution is time-capped (~3 min in Chrome); long transfers belong in Background Fetch, not sync handlers. **Background Fetch** (Chrome 74+) survives tab and, on Android, browser closure, but is deliberately "highly visible and easily abortable" with progress UI — not a silent sync channel. — [Chrome blog](https://developer.chrome.com/blog/background-sync), [Chrome: Background Fetch](https://developer.chrome.com/blog/background-fetch)
- Everything else (timers, polling, fetch loops) requires an open foreground page; idle service workers are killed within seconds.

---

## 4. What "no manual sync ever" actually gets on Android Chrome

Guaranteed (as strongly as the web platform guarantees anything):

1. **Writes made offline reach the server without user action.** Persist mutations to IndexedDB, register a one-shot sync; the service worker wakes on connectivity regain — even with the PWA and every tab closed — and flushes the outbox, with exponential-backoff retries (Chrome: 3 attempts, ~+5 min and ~+15 min). Flush again on every app launch and `online` event as the backstop for the server-down case. — [WICG spec](https://wicg.github.io/background-sync/spec/), [Chrome blog](https://developer.chrome.com/blog/background-sync), [Chromium background_sync_parameters.cc](https://chromium.googlesource.com/chromium/src/+/main/content/public/browser/background_sync_parameters.cc)
2. **Pull-on-open.** Fetching at app launch/focus is always available and is the only way to guarantee freshness at the moment of use.

Best-effort only:

3. **Background downloads** via Periodic Background Sync: >= 12 h apart per origin, only while engagement score > 0, only on known networks, timing chosen by Chrome. Fine for pre-warming caches (e.g., overnight refresh of checklists between phone and tablet); not a real-time sync channel. — [WICG spec](https://wicg.github.io/periodic-background-sync/), [Chrome docs](https://developer.chrome.com/docs/capabilities/periodic-background-sync)

Not available:

4. Silent server push, sub-12-hour background polling, and anything after a user force-stop of Chrome (until Chrome next runs). Firefox and Safari (incl. iOS) support none of these sync APIs — the whole model is Chromium-on-Android specific. Out of scope here per #124: devices are 100% Android.

**Implication for rv-checklist (phone + tablet, single user):** the correct architecture is offline-first local store + outbox flushed by one-shot Background Sync + full pull on every app open, with Periodic Background Sync as an optional freshness bonus. That combination meets "no manual sync ever" for a two-device personal app: each device is current the moment it is opened, and no edit is ever lost to connectivity.

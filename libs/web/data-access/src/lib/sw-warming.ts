import {
  orderAttachmentsForWarming,
  type CacheTripMessage,
  type DropTripMessage,
  type Id,
  type SwMessage,
  type TripRead,
} from '@rv-checklist/domain';
import { useEffect, useRef, useState } from 'react';
import { attachmentUrl } from './api.js';

/**
 * Current-trip warming, the client's half of the message protocol
 * (ADR-0028, issue #151). The service worker is not always in control of the
 * page (no support, dev mode never registers one at all — `sw-register.tsx`),
 * so posting is always best-effort and silent.
 *
 * When a worker exists but has not claimed this page yet, the message waits
 * rather than being dropped. That gap is the whole first visit: the worker
 * installs while the page renders, so `controller` is null exactly when
 * {@link useCurrentTripWarming}'s effect fires, and the effect has no reason
 * to run again once `clientsClaim` takes hold. Dropping it there meant a
 * freshly installed PWA cached nothing on the visit that installed it — open
 * it once, drive out of signal, and every route fell back to `/offline`.
 */
export async function postToServiceWorker(message: SwMessage): Promise<void> {
  // Checked by value, not with `in`: the key is present but undefined in a
  // non-secure context and under some test environments.
  const container: ServiceWorkerContainer | undefined =
    typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (!container) return;
  const controller = container.controller ?? (await whenControlled(container));
  controller?.postMessage(message);
}

/**
 * The controller once a worker claims this page, or `undefined` if none ever
 * does. `ready` resolves on activation but says nothing about control, and
 * `controllerchange` fires on the claim without carrying the controller — so
 * this waits on both and reads `controller` back off the container.
 */
function whenControlled(
  container: ServiceWorkerContainer,
): Promise<ServiceWorker | undefined> {
  return new Promise((resolve) => {
    const settle = (): void => {
      if (container.controller === null) return;
      container.removeEventListener('controllerchange', settle);
      resolve(container.controller);
    };
    container.addEventListener('controllerchange', settle);
    // Covers the claim that lands between the null check above and this
    // listener going on: `ready` resolving is the latest point at which a
    // worker could already be in control with no further event coming.
    void container.ready.then(settle).catch(() => {
      container.removeEventListener('controllerchange', settle);
      resolve(undefined);
    });
  });
}

/** The routes a current trip warms: the rig dashboard and this trip's page. */
function tripRouteUrls(rigId: Id, tripId: Id): string[] {
  return [`/rig/${rigId}`, `/rig/${rigId}/trips/${tripId}`];
}

/**
 * The `cache-trip` message for one trip: its two routes, and its attachments
 * ordered campground maps first (issue #151's warming priority).
 */
export function buildTripWarmMessage(
  rigId: Id,
  trip: TripRead,
): CacheTripMessage {
  const attachments = orderAttachmentsForWarming(
    trip.stops.flatMap((stop) => stop.attachments),
  );
  return {
    type: 'rv-checklist/cache-trip',
    tripId: trip.id,
    routeUrls: tripRouteUrls(rigId, trip.id),
    attachmentUrls: attachments.map((a) => attachmentUrl(a.id)),
  };
}

/** A trip's attachment ids, in warming order — what "did the set change" compares. */
function attachmentFingerprint(trip: TripRead): string {
  return orderAttachmentsForWarming(
    trip.stops.flatMap((stop) => stop.attachments),
  )
    .map((a) => a.id)
    .join(',');
}

/**
 * The messages to post for one render of the current trip, given what was
 * current (and its attachment set) last render. Pure, so the three triggers
 * from the issue collapse into one decision that is easy to unit test without
 * a service worker: (a) `previousTripId` differs from `current.id` — the
 * trip became current, warm it, and drop whatever was current before; the
 * trip stopped being current with nothing replacing it — just drop; (b) same
 * trip, but its attachments changed (a synced attachment arrived) — re-warm
 * (the worker skips ids it already has, so this is cheap); (c) first render
 * while online — `previousTripId` is `undefined` and `previousTrip` is
 * `undefined`, so a current trip warms unconditionally.
 */
export function warmingActions(
  rigId: Id,
  previousTripId: Id | undefined,
  current: TripRead | undefined,
  previousTrip?: TripRead,
): { drop?: DropTripMessage; cache?: CacheTripMessage } {
  const isTripChanged = previousTripId !== current?.id;

  const drop: Record<string, never> | { drop: DropTripMessage } =
    isTripChanged && previousTripId !== undefined
      ? { drop: { type: 'rv-checklist/drop-trip', tripId: previousTripId } }
      : {};

  if (current === undefined) {
    return drop;
  }

  const isAttachmentsChanged =
    !isTripChanged &&
    previousTrip !== undefined &&
    attachmentFingerprint(previousTrip) !== attachmentFingerprint(current);

  if (!isTripChanged && !isAttachmentsChanged) {
    return {};
  }

  return { ...drop, cache: buildTripWarmMessage(rigId, current) };
}

/**
 * Warm the current trip's routes and attachments (triggers (a) and (b)),
 * drop the previous current trip's cache when it stops being current, and
 * warm on mount while online (trigger (c) — "app open"). A no-op offline:
 * there is nothing useful to fetch, and the point of the caches is to have
 * already been filled before that happened.
 */
export function useCurrentTripWarming(
  rigId: Id,
  current: TripRead | undefined,
  isOffline: boolean,
): void {
  const previousTripId = useRef<Id | undefined>(undefined);
  const previousTrip = useRef<TripRead | undefined>(undefined);

  useEffect(() => {
    if (isOffline) return;
    const { drop, cache } = warmingActions(
      rigId,
      previousTripId.current,
      current,
      previousTrip.current,
    );
    // Fire-and-forget: posting now waits for the worker to take control, and
    // an effect cannot await. Failure is silent by design (see the doc above).
    if (drop) void postToServiceWorker(drop);
    if (cache) void postToServiceWorker(cache);
    previousTripId.current = current?.id;
    previousTrip.current = current;
    // `current` is compared by identity above via its id/attachment
    // fingerprint inside `warmingActions`, not by this dependency array —
    // rerunning whenever the trip object reference changes (RTK Query gives
    // it structural sharing, so this is "whenever the data actually could
    // have changed") is what lets `warmingActions` see the previous value.
  }, [rigId, current, isOffline]);
}

/**
 * Evict a deleted (or metadata-vanished) attachment from every cache that
 * might hold its bytes — trip cache and the browsed-attachment LRU alike
 * (issue #151's fourth acceptance criterion).
 */
export function evictAttachmentCache(attachmentId: Id): void {
  void postToServiceWorker({
    type: 'rv-checklist/evict-attachment',
    attachmentUrl: attachmentUrl(attachmentId),
  });
}

/**
 * Whether an attachment's bytes are already in Cache Storage — same-origin
 * even though the url itself is cross-origin (ADR-0019): the Cache Storage
 * API partitions by the page/worker's own origin, not by the resource's, so
 * the page can read back exactly what the worker cached. `undefined` while
 * unknown (server render, or the check hasn't resolved yet) and whenever the
 * check is disabled — callers only need this while offline, since online the
 * view action always works (network fills the cache on demand).
 */
export function useIsAttachmentCached(
  attachmentId: Id,
  isEnabled: boolean,
): boolean | undefined {
  const [cached, setCached] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    if (!isEnabled) {
      setCached(undefined);
      return;
    }
    if (typeof caches === 'undefined') {
      setCached(false);
      return;
    }
    let isCancelled = false;
    const check = async (): Promise<void> => {
      try {
        const response = await caches.match(attachmentUrl(attachmentId));
        if (!isCancelled) setCached(response !== undefined);
      } catch {
        if (!isCancelled) setCached(false);
      }
    };
    void check();
    return (): void => {
      isCancelled = true;
    };
  }, [attachmentId, isEnabled]);

  return cached;
}

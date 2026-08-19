import type { JSX } from 'react';
import { TripPrototypeScreen } from './trip-prototype-screen';

/**
 * PROTOTYPE — THROWAWAY (wayfinder ticket #105, map #102).
 *
 * Three variants of the trip planning screen and the per-stop "one-stop-shop
 * at arrival" view, switchable via `?variant=` (a / b / c), on this throwaway
 * route. All data is in-memory mock data; nothing is persisted. Manual km
 * placeholders — the Google Maps decision (#104) is pending.
 *
 * Delete this folder once a variant wins; the winner gets rebuilt properly.
 */
export default async function TripsPrototypePage({
  params,
}: {
  readonly params: Promise<{ rigId: string }>;
}): Promise<JSX.Element> {
  const { rigId } = await params;
  return <TripPrototypeScreen rigId={rigId} />;
}

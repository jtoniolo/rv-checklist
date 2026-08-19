import { notFound } from 'next/navigation';
import type { JSX } from 'react';
import { TripScreen } from '../../../../trip-screen';
import { CacheSeeder } from '@/lib/cache-seeder';
import {
  fetchChecklists,
  fetchRunsByTrip,
  fetchTripsByRig,
} from '@/lib/server-api';

/**
 * The trip page (issue #116) — Pattern C (ADR-0018): fetch the rig's trips,
 * its checklists, and this trip's runs on the server, 404 when the trip id
 * isn't among the rig's trips, seed the cache, and render the client screen.
 */
export default async function TripPage({
  params,
}: {
  readonly params: Promise<{ rigId: string; tripId: string }>;
}): Promise<JSX.Element> {
  const { rigId, tripId } = await params;
  const [trips, checklists, runs] = await Promise.all([
    fetchTripsByRig(rigId),
    fetchChecklists(rigId),
    fetchRunsByTrip(tripId),
  ]);
  const trip = trips.find((t) => t.id === tripId);

  if (trip === undefined) {
    notFound();
  }

  return (
    <CacheSeeder
      trips={{ rigId, data: trips }}
      checklists={{ rigId, data: checklists }}
      runsByTrip={{ tripId, data: runs }}
    >
      <TripScreen rigId={rigId} tripId={tripId} />
    </CacheSeeder>
  );
}

import { notFound } from 'next/navigation';
import type { JSX } from 'react';
import { TripEditorScreen } from '../../../../../trip-editor-screen';
import { CacheSeeder } from '@/lib/cache-seeder';
import { fetchTripsByRig } from '@/lib/server-api';

/**
 * The trip editor route (issue #115): confirms the trip exists, seeds the
 * rig's trips (ADR-0018 — Pattern C), and hands off to the client editor.
 */
export default async function TripEditPage({
  params,
}: {
  readonly params: Promise<{ rigId: string; tripId: string }>;
}): Promise<JSX.Element> {
  const { rigId, tripId } = await params;
  const trips = await fetchTripsByRig(rigId);
  const trip = trips.find((t) => t.id === tripId);

  if (trip === undefined) {
    notFound();
  }

  return (
    <CacheSeeder trips={{ rigId, data: trips }}>
      <TripEditorScreen rigId={rigId} tripId={tripId} />
    </CacheSeeder>
  );
}

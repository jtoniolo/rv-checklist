import { StatusChip } from '@rv-checklist/web-ui';
import { notFound } from 'next/navigation';
import type { JSX } from 'react';
import { CacheSeeder } from '@/lib/cache-seeder';
import { fetchTripsByRig } from '@/lib/server-api';

/**
 * Stub trip page (issue #114): fixes the `/rig/{rigId}/trips/{tripId}` route
 * shape and confirms the trip exists. The trip dashboard replaces this body
 * (issue #116).
 */
export default async function TripPage({
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
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{trip.name}</h1>
          <StatusChip status={trip.status} />
        </div>
        <p className="text-brand-muted">The trip dashboard is on its way.</p>
      </div>
    </CacheSeeder>
  );
}

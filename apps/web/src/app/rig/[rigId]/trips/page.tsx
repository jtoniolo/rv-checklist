import type { JSX } from 'react';
import { TripsScreen } from '../../../trips-screen';
import { CacheSeeder } from '@/lib/cache-seeder';
import { fetchTripsByRig } from '@/lib/server-api';

export default async function TripsPage({
  params,
}: {
  readonly params: Promise<{ rigId: string }>;
}): Promise<JSX.Element> {
  const { rigId } = await params;
  const trips = await fetchTripsByRig(rigId);

  return (
    <CacheSeeder trips={{ rigId, data: trips }}>
      <TripsScreen rigId={rigId} />
    </CacheSeeder>
  );
}

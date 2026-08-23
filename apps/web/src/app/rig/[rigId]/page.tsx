import type { JSX } from 'react';
import { DashboardScreen } from '../../dashboard-screen';
import { CacheSeeder } from '@/lib/cache-seeder';
import {
  fetchLogEntriesByRig,
  fetchMe,
  fetchRigs,
  fetchTasks,
  fetchTripsByRig,
} from '@/lib/server-api';

/**
 * The rig home/dashboard page (ADR-0018 — Pattern C). An async server
 * component that fetches everything the dashboard reads and seeds the RTK
 * Query cache; the DashboardScreen renders from hooks only (issue #135), so
 * the SSR HTML contains the owner's data and later tag invalidation still
 * updates the trip card and due badges in place.
 */
export default async function RigHomePage({
  params,
}: {
  readonly params: Promise<{ rigId: string }>;
}): Promise<JSX.Element> {
  const { rigId } = await params;
  const [me, rigs, tasks, logEntries, trips] = await Promise.all([
    fetchMe(),
    fetchRigs(),
    fetchTasks(rigId),
    fetchLogEntriesByRig(rigId),
    fetchTripsByRig(rigId),
  ]);

  return (
    <CacheSeeder
      me={me}
      rigs={rigs}
      tasks={{ rigId, data: tasks }}
      logEntries={{ rigId, data: logEntries }}
      trips={{ rigId, data: trips }}
    >
      <DashboardScreen rigId={rigId} />
    </CacheSeeder>
  );
}

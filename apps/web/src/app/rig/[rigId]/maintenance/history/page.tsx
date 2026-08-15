import type { JSX } from 'react';
import { MaintenanceScreen } from '../../../../maintenance-screen';
import { CacheSeeder } from '@/lib/cache-seeder';
import { fetchLogEntriesByRig, fetchRigs, fetchTasks } from '@/lib/server-api';

/**
 * The rig-wide maintenance history page (ADR-0018 — rig-scoped routes,
 * issue #59). An async server component that fetches tasks and log entries,
 * seeds the cache, and renders the MaintenanceScreen in history view.
 */
export default async function MaintenanceHistoryPage({
  params,
}: {
  readonly params: Promise<{ rigId: string }>;
}): Promise<JSX.Element> {
  const { rigId } = await params;
  const [rigs, tasks, logEntries] = await Promise.all([
    fetchRigs(),
    fetchTasks(rigId),
    fetchLogEntriesByRig(rigId),
  ]);

  const rig = rigs.find((r) => r.id === rigId);

  return (
    <CacheSeeder
      tasks={{ rigId, data: tasks }}
      logEntries={{ rigId, data: logEntries }}
    >
      <MaintenanceScreen activeRig={rig} rigId={rigId} view="history" />
    </CacheSeeder>
  );
}

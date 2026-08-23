import type { JSX } from 'react';
import { MaintenanceScreen } from '../../../../maintenance-screen';
import { CacheSeeder } from '@/lib/cache-seeder';
import { fetchLogEntriesByRig, fetchTasks } from '@/lib/server-api';

/**
 * The rig-wide maintenance history page (ADR-0018 — rig-scoped routes,
 * issue #59). An async server component that fetches tasks and log entries,
 * seeds the cache, and renders the MaintenanceScreen in history view. The
 * rig itself comes from the layout's seeded rig list (issue #135).
 */
export default async function MaintenanceHistoryPage({
  params,
}: {
  readonly params: Promise<{ rigId: string }>;
}): Promise<JSX.Element> {
  const { rigId } = await params;
  const [tasks, logEntries] = await Promise.all([
    fetchTasks(rigId),
    fetchLogEntriesByRig(rigId),
  ]);

  return (
    <CacheSeeder
      tasks={{ rigId, data: tasks }}
      logEntries={{ rigId, data: logEntries }}
    >
      <MaintenanceScreen rigId={rigId} view="history" />
    </CacheSeeder>
  );
}

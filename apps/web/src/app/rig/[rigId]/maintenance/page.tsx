import type { JSX } from 'react';
import { MaintenanceScreen } from '../../../maintenance-screen';
import { CacheSeeder } from '@/lib/cache-seeder';
import { fetchLogEntriesByRig, fetchTasks } from '@/lib/server-api';

/**
 * The maintenance task list page (ADR-0018 — rig-scoped routes, issue #59).
 * An async server component that fetches tasks and log entries, seeds the
 * RTK Query cache, and renders the client-side MaintenanceScreen for
 * interactive list/filter/sort behaviour. The rig itself comes from the
 * layout's seeded rig list — the screen reads it via hooks (issue #135).
 */
export default async function MaintenanceListPage({
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
      <MaintenanceScreen rigId={rigId} />
    </CacheSeeder>
  );
}

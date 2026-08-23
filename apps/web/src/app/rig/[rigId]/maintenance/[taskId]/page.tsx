import type { JSX } from 'react';
import { MaintenanceScreen } from '../../../../maintenance-screen';
import { CacheSeeder } from '@/lib/cache-seeder';
import { fetchLogEntriesByRig, fetchTasks } from '@/lib/server-api';

/**
 * The maintenance task detail page (ADR-0018 — rig-scoped routes, issue #59).
 * Deep-linking a task by URL works: the async server component fetches the
 * rig's tasks and log entries, seeds the cache, and renders the
 * MaintenanceScreen with the task pre-selected. The rig itself comes from
 * the layout's seeded rig list (issue #135). Task and log-entry forms stay
 * client-side.
 */
export default async function MaintenanceTaskPage({
  params,
}: {
  readonly params: Promise<{ rigId: string; taskId: string }>;
}): Promise<JSX.Element> {
  const { rigId, taskId } = await params;
  const [tasks, logEntries] = await Promise.all([
    fetchTasks(rigId),
    fetchLogEntriesByRig(rigId),
  ]);

  return (
    <CacheSeeder
      tasks={{ rigId, data: tasks }}
      logEntries={{ rigId, data: logEntries }}
    >
      <MaintenanceScreen rigId={rigId} openTaskId={taskId} />
    </CacheSeeder>
  );
}

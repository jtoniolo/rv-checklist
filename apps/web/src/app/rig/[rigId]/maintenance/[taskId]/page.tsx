import type { JSX } from 'react';
import { MaintenanceScreen } from '../../../../maintenance-screen';
import { CacheSeeder } from '@/lib/cache-seeder';
import { fetchLogEntriesByRig, fetchRigs, fetchTasks } from '@/lib/server-api';

/**
 * The maintenance task detail page (ADR-0018 — rig-scoped routes, issue #59).
 * Deep-linking a task by URL works: the async server component fetches the
 * rig's tasks and log entries, seeds the cache, and renders the
 * MaintenanceScreen with the task pre-selected. Task and log-entry forms
 * stay client-side.
 */
export default async function MaintenanceTaskPage({
  params,
}: {
  readonly params: Promise<{ rigId: string; taskId: string }>;
}): Promise<JSX.Element> {
  const { rigId, taskId } = await params;
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
      <MaintenanceScreen activeRig={rig} rigId={rigId} openTaskId={taskId} />
    </CacheSeeder>
  );
}

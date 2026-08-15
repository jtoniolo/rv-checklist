import type { JSX } from 'react';
import { MaintenanceScreen } from '../../../maintenance-screen';
import { CacheSeeder } from '@/lib/cache-seeder';
import { fetchLogEntriesByRig, fetchRigs, fetchTasks } from '@/lib/server-api';

/**
 * The maintenance task list page (ADR-0018 — rig-scoped routes, issue #59).
 * An async server component that fetches tasks and log entries, seeds the
 * RTK Query cache, and renders the client-side MaintenanceScreen for
 * interactive list/filter/sort behaviour.
 */
export default async function MaintenanceListPage({
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
      <MaintenanceScreen activeRig={rig} rigId={rigId} />
    </CacheSeeder>
  );
}

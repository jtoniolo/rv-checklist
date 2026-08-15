import { notFound } from 'next/navigation';
import type { JSX } from 'react';
import { RunDetailView } from './run-detail-view';
import { CacheSeeder } from '@/lib/cache-seeder';
import { fetchChecklists, fetchRun, fetchTasks } from '@/lib/server-api';

export default async function RunDetailPage({
  params,
}: {
  readonly params: Promise<{ rigId: string; runId: string }>;
}): Promise<JSX.Element> {
  const { rigId, runId } = await params;
  const [run, checklists, tasks] = await Promise.all([
    fetchRun(runId),
    fetchChecklists(rigId),
    fetchTasks(rigId),
  ]);

  if (run.rigId !== rigId) {
    notFound();
  }

  const checklist = checklists.find((c) => c.id === run.checklistId);
  const title = checklist?.name ?? 'Run';

  return (
    <CacheSeeder
      run={{ runId, data: run }}
      checklists={{ rigId, data: checklists }}
      tasks={{ rigId, data: tasks }}
    >
      <RunDetailView
        rigId={rigId}
        runId={runId}
        checklistId={run.checklistId}
        title={title}
      />
    </CacheSeeder>
  );
}

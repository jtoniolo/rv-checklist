import { notFound } from 'next/navigation';
import type { JSX } from 'react';
import { ChecklistDetailView } from './checklist-detail-view';
import { CacheSeeder } from '@/lib/cache-seeder';
import { fetchChecklists, fetchRunsByRig, fetchTasks } from '@/lib/server-api';

export default async function ChecklistDetailPage({
  params,
}: {
  readonly params: Promise<{ rigId: string; checklistId: string }>;
}): Promise<JSX.Element> {
  const { rigId, checklistId } = await params;
  const [checklists, runsByRig, tasks] = await Promise.all([
    fetchChecklists(rigId),
    fetchRunsByRig(rigId),
    fetchTasks(rigId),
  ]);

  if (checklists.every((c) => c.id !== checklistId)) {
    notFound();
  }

  return (
    <CacheSeeder
      checklists={{ rigId, data: checklists }}
      runsByRig={{ rigId, data: runsByRig }}
      tasks={{ rigId, data: tasks }}
    >
      <ChecklistDetailView rigId={rigId} checklistId={checklistId} />
    </CacheSeeder>
  );
}

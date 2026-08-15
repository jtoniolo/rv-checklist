import type { JSX } from 'react';
import { ChecklistsScreen } from '../../../checklists-screen';
import { CacheSeeder } from '@/lib/cache-seeder';
import { fetchChecklists, fetchRunsByRig } from '@/lib/server-api';

export default async function ChecklistsPage({
  params,
}: {
  readonly params: Promise<{ rigId: string }>;
}): Promise<JSX.Element> {
  const { rigId } = await params;
  const [checklists, runsByRig] = await Promise.all([
    fetchChecklists(rigId),
    fetchRunsByRig(rigId),
  ]);

  return (
    <CacheSeeder
      checklists={{ rigId, data: checklists }}
      runsByRig={{ rigId, data: runsByRig }}
    >
      <ChecklistsScreen rigId={rigId} />
    </CacheSeeder>
  );
}

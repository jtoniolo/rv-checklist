import type { JSX } from 'react';
import { RigManager } from '../rig-manager';
import { CacheSeeder } from '@/lib/cache-seeder';
import { fetchMe, fetchRigs } from '@/lib/server-api';

/**
 * Rig manager page (ADR-0018). Rig-agnostic: lives outside `/rig/[rigId]/`,
 * no RigShell layout. Server-fetches me and rigs, seeds the RTK Query cache,
 * and renders the CRUD surface.
 */
export default async function RigsPage(): Promise<JSX.Element> {
  const [me, rigs] = await Promise.all([fetchMe(), fetchRigs()]);

  return (
    <CacheSeeder me={me} rigs={rigs}>
      <div className="mx-auto w-full max-w-5xl px-4 pt-6 lg:px-6">
        <RigManager />
      </div>
    </CacheSeeder>
  );
}

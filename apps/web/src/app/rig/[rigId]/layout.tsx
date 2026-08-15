import type { JSX, ReactNode } from 'react';
import { RigShell } from './rig-shell';
import { CacheSeeder } from '@/lib/cache-seeder';
import { fetchMe, fetchRigs } from '@/lib/server-api';

/**
 * The layout for rig-scoped routes (ADR-0018). Fetches the owner and rigs
 * server-side, seeds them into the RTK Query cache, and wraps children in
 * the signed-in navigation chrome. The shell receives its data as props
 * (layout chrome, not a feature component) so the header and rig selector
 * appear in the server-rendered HTML without a spinner.
 */
export default async function RigLayout({
  children,
  params,
}: {
  readonly children: ReactNode;
  readonly params: Promise<{ rigId: string }>;
}): Promise<JSX.Element> {
  const { rigId } = await params;
  const [me, rigs] = await Promise.all([fetchMe(), fetchRigs()]);

  return (
    <CacheSeeder me={me} rigs={rigs}>
      <RigShell rigId={rigId} owner={me} rigs={rigs}>
        {children}
      </RigShell>
    </CacheSeeder>
  );
}

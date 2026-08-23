import type { JSX, ReactNode } from 'react';
import { RigShell } from './rig-shell';
import { CacheSeeder } from '@/lib/cache-seeder';
import { fetchMe, fetchRigs } from '@/lib/server-api';

/**
 * The layout for rig-scoped routes (ADR-0018). Fetches the owner and rigs
 * server-side and seeds them into the RTK Query cache, so the shell's hooks
 * render the header and rig selector in the SSR HTML without a spinner —
 * and, because the shell subscribes (issue #135), a rig rename reaches the
 * header through tag invalidation even though layout segments never
 * re-render on navigation.
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
      <RigShell rigId={rigId}>{children}</RigShell>
    </CacheSeeder>
  );
}

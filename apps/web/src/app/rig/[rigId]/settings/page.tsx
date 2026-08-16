import type { JSX } from 'react';
import { RigSettingsScreen } from '../../../rig-settings-screen';

/**
 * The rig settings page (ADR-0018 — rig-scoped routes, issue #62). The "Rig"
 * nav item lands here. The rig layout already fetches and seeds me + rigs,
 * so this page only unwraps the rigId and renders the client screen, which
 * reads the seeded rigs cache.
 */
export default async function RigSettingsPage({
  params,
}: {
  readonly params: Promise<{ rigId: string }>;
}): Promise<JSX.Element> {
  const { rigId } = await params;
  return <RigSettingsScreen rigId={rigId} />;
}

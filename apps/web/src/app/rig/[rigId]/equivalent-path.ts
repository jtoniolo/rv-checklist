/**
 * Compute the equivalent rig-scoped path when switching rigs. Preserves the
 * first segment after the rigId (the section — maintenance, checklists, etc.)
 * but drops deeper entity-specific segments. From `/rig/abc/maintenance/task123`
 * switching to rig xyz produces `/rig/xyz/maintenance`. Sections with no
 * rig-scoped index route map to the section they are reached from: a run
 * detail (`/rig/abc/runs/run123`) lands on the new rig's checklists list,
 * since runs are only reachable via checklists (issue #62).
 */
export function equivalentPath(pathname: string, newRigId: string): string {
  const segments = pathname.split('/');
  const section = segments[3] === 'runs' ? 'checklists' : segments[3];
  return section ? `/rig/${newRigId}/${section}` : `/rig/${newRigId}`;
}

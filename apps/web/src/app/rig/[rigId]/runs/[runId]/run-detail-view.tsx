'use client';

import type { Id } from '@rv-checklist/domain';
import { useRouter } from 'next/navigation';
import type { JSX } from 'react';
import { RunScreen } from '../../../../run-screen';

export function RunDetailView({
  rigId,
  runId,
  checklistId,
  title,
}: {
  readonly rigId: Id;
  readonly runId: Id;
  readonly checklistId: Id;
  readonly title: string;
}): JSX.Element {
  const router = useRouter();

  return (
    <RunScreen
      runId={runId}
      title={title}
      onExit={() => {
        router.push(`/rig/${rigId}/checklists/${checklistId}`);
      }}
    />
  );
}

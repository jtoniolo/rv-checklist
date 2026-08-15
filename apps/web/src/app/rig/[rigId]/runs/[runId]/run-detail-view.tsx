'use client';

import type { Id, Run } from '@rv-checklist/domain';
import { useRouter } from 'next/navigation';
import type { JSX } from 'react';
import { RunScreen } from '../../../../run-screen';

export function RunDetailView({
  rigId,
  runId,
  checklistId,
  title,
  initialRun,
}: {
  readonly rigId: Id;
  readonly runId: Id;
  readonly checklistId: Id;
  readonly title: string;
  readonly initialRun: Run;
}): JSX.Element {
  const router = useRouter();

  return (
    <RunScreen
      runId={runId}
      title={title}
      initialRun={initialRun}
      onExit={() => {
        router.push(`/rig/${rigId}/checklists/${checklistId}`);
      }}
    />
  );
}

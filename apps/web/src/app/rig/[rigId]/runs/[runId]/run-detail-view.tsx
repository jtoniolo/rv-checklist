'use client';

import type { Id } from '@rv-checklist/domain';
import {
  useGetRunQuery,
  useListChecklistsQuery,
} from '@rv-checklist/web-data-access';
import { useRouter } from 'next/navigation';
import type { JSX } from 'react';
import { RunScreen } from '../../../../run-screen';

/**
 * The run page's client view (ADR-0018, issue #135): everything beyond the
 * route params — the run's checklist and its name for the title and exit
 * target — comes from RTK Query hooks over the page-seeded cache, not from
 * server props.
 */
export function RunDetailView({
  rigId,
  runId,
}: {
  readonly rigId: Id;
  readonly runId: Id;
}): JSX.Element {
  const router = useRouter();
  const { data: run } = useGetRunQuery(runId);
  const { data: checklists } = useListChecklistsQuery(rigId);
  const checklist = checklists?.find((c) => c.id === run?.checklistId);

  return (
    <RunScreen
      runId={runId}
      title={checklist?.name ?? 'Run'}
      onExit={() => {
        router.push(
          run
            ? `/rig/${rigId}/checklists/${run.checklistId}`
            : `/rig/${rigId}/checklists`,
        );
      }}
    />
  );
}

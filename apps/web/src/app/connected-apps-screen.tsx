'use client';

import {
  useListOAuthGrantsQuery,
  useRevokeOAuthGrantMutation,
} from '@rv-checklist/web-data-access';
import Link from 'next/link';
import { type JSX } from 'react';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ConnectedAppsScreen(): JSX.Element {
  const { data: grants, isLoading, isError } = useListOAuthGrantsQuery();
  const [revokeGrant, { isLoading: isRevoking }] =
    useRevokeOAuthGrantMutation();

  return (
    <section className="flex flex-col gap-4" aria-label="Connected apps">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-brand dark:text-ink-inverted">
          Connected apps
        </h2>
        <Link
          href="/rigs"
          className="text-sm font-medium text-brand-muted hover:text-brand dark:hover:text-ink-inverted"
        >
          Back
        </Link>
      </div>

      <p className="text-sm text-brand-muted">
        Apps that connect to your account through MCP OAuth. Revoking an app
        disconnects it immediately.
      </p>

      {isLoading ? (
        <p className="text-brand-muted">Loading connected apps...</p>
      ) : undefined}

      {isError ? (
        <p className="text-red-600 dark:text-red-400" role="alert">
          Could not load connected apps. Please try again.
        </p>
      ) : undefined}

      {!isLoading && grants?.length === 0 ? (
        <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-brand-muted">
          No connected apps.
        </p>
      ) : undefined}

      {grants && grants.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {grants.map((grant) => (
            <li
              key={grant.id}
              className="flex flex-col gap-2 rounded-xl border border-hairline p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-brand dark:text-ink-inverted">
                    {grant.clientName}
                  </span>
                  <span className="text-xs text-brand-muted">
                    Connected {formatDate(grant.createdAt)}
                  </span>
                  {grant.lastUsedAt ? (
                    <span className="text-xs text-brand-muted">
                      Last used {formatDate(grant.lastUsedAt)}
                    </span>
                  ) : undefined}
                </div>
                <button
                  type="button"
                  disabled={isRevoking}
                  onClick={() => void revokeGrant(grant.id)}
                  className="rounded-md border border-red-300 px-3 py-1 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
                >
                  Revoke
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : undefined}
    </section>
  );
}

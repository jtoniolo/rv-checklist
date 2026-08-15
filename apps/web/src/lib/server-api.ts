import {
  ChecklistSchema,
  LogEntrySchema,
  MaintenanceTaskSchema,
  OwnerSchema,
  RigSchema,
  RunSchema,
  type Checklist,
  type Id,
  type LogEntry,
  type MaintenanceTask,
  type Owner,
  type Rig,
  type Run,
} from '@rv-checklist/domain';
import { cookies } from 'next/headers';

/**
 * The API base URL for server-side fetches (ADR-0018). Prefers a server-only
 * env var (`API_BASE_URL`) so the server can reach the API at an internal
 * address; falls back to the browser-visible `NEXT_PUBLIC_API_BASE_URL`,
 * which Next inlines at build.
 */
function apiBaseUrl(): string {
  return (
    process.env['API_BASE_URL'] ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? ''
  );
}

interface Parser<T> {
  parse: (data: unknown) => T;
}

function arrayOf<T>(schema: Parser<T>): Parser<T[]> {
  return {
    parse(data: unknown): T[] {
      if (!Array.isArray(data)) {
        throw new TypeError('Expected array from API');
      }
      return (data as unknown[]).map((item) => schema.parse(item));
    },
  };
}

/**
 * Fetch from the API on behalf of a server component (ADR-0018 — Pattern C).
 * Reads the incoming request's cookies and forwards them so the API sees the
 * same session the browser established. The response is validated through the
 * given parser (a Zod schema or the `arrayOf` wrapper).
 */
async function serverFetch<T>(path: string, parser: Parser<T>): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const response = await fetch(`${apiBaseUrl()}${path}`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`API ${path}: ${String(response.status)}`);
  }

  const data: unknown = await response.json();
  return parser.parse(data);
}

export function fetchMe(): Promise<Owner> {
  return serverFetch('/me', OwnerSchema);
}

export function fetchRigs(): Promise<Rig[]> {
  return serverFetch('/rigs', arrayOf(RigSchema));
}

export function fetchTasks(rigId: Id): Promise<MaintenanceTask[]> {
  return serverFetch(`/tasks?rigId=${rigId}`, arrayOf(MaintenanceTaskSchema));
}

export function fetchLogEntriesByRig(rigId: Id): Promise<LogEntry[]> {
  return serverFetch(`/log-entries?rigId=${rigId}`, arrayOf(LogEntrySchema));
}

export function fetchChecklists(rigId: Id): Promise<Checklist[]> {
  return serverFetch(`/checklists?rigId=${rigId}`, arrayOf(ChecklistSchema));
}

export function fetchRunsByRig(rigId: Id): Promise<Run[]> {
  return serverFetch(`/runs?rigId=${rigId}`, arrayOf(RunSchema));
}

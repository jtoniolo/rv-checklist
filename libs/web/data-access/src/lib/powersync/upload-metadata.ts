import type { RunStepOp } from '@rv-checklist/domain';

/**
 * What a queued local write carries beyond its changed columns (ADR-0028).
 * PowerSync's CRUD entries are diffs of a SQLite row — they can say *that*
 * `arrived` or `steps` changed, never *why* — so two things the semantic
 * endpoints need have nowhere else to live and ride in the row's `_metadata`
 * column instead (`trackMetadata`, `client.ts`), JSON-encoded:
 *
 * - `editedAt`: the ISO instant the owner actually made the edit, offline or
 *   on. Every gated write needs this for `X-Edited-At` (#141) — server
 *   receipt time would make a replayed offline edit look newer than it is,
 *   the opposite of newest-wins. Absent falls back to the endpoint's default
 *   (today's behaviour, effectively "now").
 * - `runStepOps`: present only on a `runs` row write that recorded step work
 *   (ADR-0030, #144) rather than a whole-record edit. Each op already carries
 *   its own `editedAt` and, for an offline task completion, the client-
 *   authored `logEntryId` (issue #144) — nothing else names which steps
 *   changed, so a plain column diff cannot stand in for it.
 *
 * A local write that sets neither is replayed as a plain field edit stamped
 * "now" — correct for an online write, and the same shape #146 already reads
 * back out. This is the contract the local write path (#149/#152/#154) must
 * honour; nothing upstream of the connector enforces it, so a malformed or
 * absent `_metadata` degrades to that same "now" edit rather than failing.
 */
export interface UploadMetadata {
  readonly editedAt?: string;
  readonly runStepOps?: readonly RunStepOp[];
}

/** Parse a CRUD entry's `metadata` string; anything unreadable degrades to `{}`. */
export function parseUploadMetadata(raw: string | undefined): UploadMetadata {
  if (raw === undefined) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) return {};

  const record = parsed as Record<string, unknown>;
  const editedAt =
    typeof record['editedAt'] === 'string' ? record['editedAt'] : undefined;
  const runStepOps = Array.isArray(record['runStepOps'])
    ? (record['runStepOps'] as RunStepOp[])
    : undefined;

  return {
    ...(editedAt !== undefined && { editedAt }),
    ...(runStepOps !== undefined && { runStepOps }),
  };
}

import { NotFoundException } from '@nestjs/common';
import type { InsertResult } from '@rv-checklist/domain';

/**
 * Settle a create whose id may have been client-generated (ADR-0028, issue
 * #143) — the one place the rule lives, because it is the security-critical
 * half of the feature.
 *
 * A row this call created comes straight back. A row that was **already there**
 * is treated as a replay of a create the caller made before: returned
 * untouched, its LWW edit time included, so a re-posted offline create is a
 * success that leaves exactly one row rather than an overwrite. But the id is
 * client input, so the row it collided with may be another owner's, or the
 * caller's own sitting under a different parent — neither is the row the
 * request meant, and neither may be handed back. `isInScope` is that check:
 * it answers "is this the row this request would have created?" against
 * something the caller has already proved they own.
 *
 * A row that fails it is indistinguishable from "not found", exactly as
 * reading it would be (ADR-0003); `notFoundMessage` is the message that read
 * carries.
 */
export function adoptCreated<T>(
  result: InsertResult<T>,
  isInScope: (record: T) => boolean,
  notFoundMessage: string,
): T {
  if (result.created || isInScope(result.record)) {
    return result.record;
  }
  throw new NotFoundException(notFoundMessage);
}

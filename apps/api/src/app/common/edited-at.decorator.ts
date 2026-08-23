import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';

/**
 * ISO-8601 date-time with an explicit offset (`Z` or `±hh:mm`); seconds
 * required, fraction optional. Anchored so `new Date` leniency (bare dates,
 * free text) can't slip through; the `Date` constructor then rejects
 * impossible field values.
 */
const isoDateTime =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Parse and clamp one `X-Edited-At` header value against `now`. Exported for
 * the spec — the decorator below is this function bound to the request.
 */
export function parseEditedAt(
  value: string | string[] | undefined,
  now: Date,
): Date | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    throw new BadRequestException('X-Edited-At must appear at most once');
  }
  const parsed = new Date(value);
  if (!isoDateTime.test(value) || Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(
      'X-Edited-At must be an ISO-8601 date-time with an offset, e.g. 2026-08-23T12:00:00Z',
    );
  }
  return parsed > now ? now : parsed;
}

/**
 * The client's edit timestamp for server-enforced per-record LWW (ADR-0028,
 * issue #141) — the header contract, in one place:
 *
 * - **Header:** `X-Edited-At`, an ISO-8601 date-time with an explicit offset
 *   (e.g. `2026-08-23T12:00:00Z`). It is a header, not a DTO field — wire DTOs
 *   and response shapes are untouched.
 * - **Missing:** the parameter is `undefined` and the write behaves exactly as
 *   before LWW existed (it applies, stamped server now).
 * - **Malformed** (including a repeated header): 400 before the handler runs.
 * - **Future:** clamped to server time at receipt — a bad device clock can
 *   never park a record in the future and veto later edits.
 *
 * Handlers pass the value to their use-case, which applies the write only if
 * the stamp is strictly newer than the record's stored edit time; equal or
 * older is a no-op returning the current record with the normal 200 response.
 * Delta operations (stop arrival/reorder, deletes) ignore the header entirely.
 */
export const EditedAt = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Date | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    return parseEditedAt(request.headers['x-edited-at'], new Date());
  },
);

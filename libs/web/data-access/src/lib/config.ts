/**
 * The API base URL the browser calls (ADR-0002: the browser talks to the API
 * directly with its bearer token). Read from `NEXT_PUBLIC_API_BASE_URL`, which
 * Next inlines at build, so the same bundle points at a local or deployed API
 * with no code change. Empty in a non-Next context (e.g. unit tests), where the
 * network is never actually hit.
 */
export const config = {
  apiBaseUrl: process.env['NEXT_PUBLIC_API_BASE_URL'] ?? '',
} as const;

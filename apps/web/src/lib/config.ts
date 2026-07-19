/**
 * Browser-visible config (issue #13). Both values are read from the environment
 * (`NEXT_PUBLIC_*`, inlined by Next at build) so the same bundle points at a
 * local or deployed API with no code change. The defaults live in one place —
 * `next.config.js`, which always injects a concrete value — so these reads only
 * narrow `string | undefined` to `string`.
 */
export const config = {
  /** Google OAuth client id for One Tap (must match the API's GOOGLE_CLIENT_ID). */
  googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
  /** Base URL the browser calls the API at, including the `/api` prefix. */
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? '',
} as const;

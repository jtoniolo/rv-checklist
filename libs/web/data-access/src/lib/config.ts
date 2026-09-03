/**
 * The API base URL the browser calls (ADR-0019: the browser talks to the API
 * directly, authenticated by httpOnly cookies sent with `credentials:
 * 'include'`). One published image serves every environment (ADR-0020), so the
 * value reaches the browser at runtime through `window.__PUBLIC_CONFIG__`, which
 * the root layout writes from the server environment. Here we read that window
 * object in the browser, where the inline script has set it, and the
 * environment on the server, where it never is. Empty in a non-Next context
 * (e.g. unit tests), where the network is never actually hit.
 */
interface PublicRuntimeConfig {
  readonly PUBLIC_API_BASE_URL?: string;
}

function readApiBaseUrl(): string {
  const runtime = (globalThis as { __PUBLIC_CONFIG__?: PublicRuntimeConfig })
    .__PUBLIC_CONFIG__;
  if (runtime) {
    return runtime.PUBLIC_API_BASE_URL ?? '';
  }
  return process.env['PUBLIC_API_BASE_URL'] ?? '';
}

export const config = {
  apiBaseUrl: readApiBaseUrl(),
} as const;

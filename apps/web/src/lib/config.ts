/**
 * Browser-visible config (issue #13, ADR-0020). One published image serves
 * every environment, so the two public values reach the browser at runtime, not
 * at build time: the root layout reads them from the server environment and
 * writes them onto `window.__PUBLIC_CONFIG__` in an inline script. Here we read
 * that window object in the browser, where the inline script has set it, and
 * the environment on the server, where it never is. The shape stays the same,
 * so callers do not change.
 */
interface PublicRuntimeConfig {
  readonly PUBLIC_API_BASE_URL?: string;
  readonly GOOGLE_CLIENT_ID?: string;
}

function runtimeConfig(): PublicRuntimeConfig | undefined {
  return (globalThis as { __PUBLIC_CONFIG__?: PublicRuntimeConfig })
    .__PUBLIC_CONFIG__;
}

function readConfig(): { googleClientId: string; apiBaseUrl: string } {
  const runtime = runtimeConfig();
  if (runtime) {
    return {
      googleClientId: runtime.GOOGLE_CLIENT_ID ?? '',
      apiBaseUrl: runtime.PUBLIC_API_BASE_URL ?? '',
    };
  }
  return {
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
    apiBaseUrl: process.env.PUBLIC_API_BASE_URL ?? '',
  };
}

export const config = readConfig();

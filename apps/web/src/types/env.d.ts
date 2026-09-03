/**
 * Server-side environment variables the web app reads. The two public values
 * (`PUBLIC_API_BASE_URL`, `GOOGLE_CLIENT_ID`) reach the browser at runtime
 * through `window.__PUBLIC_CONFIG__` (ADR-0020), not by build-time inlining, so
 * the app reads them from `process.env` only on the server. `API_BASE_URL` is
 * the server-only internal address the SSR fetches prefer.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    readonly GOOGLE_CLIENT_ID?: string;
    readonly PUBLIC_API_BASE_URL?: string;
    readonly API_BASE_URL?: string;
  }
}

/**
 * Declared so `process.env.NEXT_PUBLIC_*` is a known property (Next inlines the
 * dot form at build) rather than an index-signature access the strict tsconfig
 * would reject.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    readonly NEXT_PUBLIC_GOOGLE_CLIENT_ID?: string;
    readonly NEXT_PUBLIC_API_BASE_URL?: string;
  }
}

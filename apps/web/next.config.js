//@ts-check
const fs = require('fs');
const path = require('path');

/**
 * Load the repo-root `.env` (issue #13) so the single committed `.env.example`
 * serves both apps: Next only auto-loads env files from the app directory, but
 * the owner keeps one `.env` at the workspace root. We read it here and expose
 * the `NEXT_PUBLIC_*` values, letting real process env win when set.
 */
function loadRootEnv() {
  const envPath = path.resolve(__dirname, '../../.env');
  /** @type {Record<string, string>} */
  const parsed = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replaceAll(/^["']|["']$/g, '');
      parsed[key] = value;
    }
  }
  return parsed;
}

const rootEnv = loadRootEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The shared UI lib is published as raw TypeScript/TSX source, so Next must
  // transpile it rather than treat it as pre-built node_modules.
  transpilePackages: ['@rv-checklist/web-ui'],
  env: {
    NEXT_PUBLIC_GOOGLE_CLIENT_ID:
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ??
      rootEnv.NEXT_PUBLIC_GOOGLE_CLIENT_ID ??
      '',
    NEXT_PUBLIC_API_BASE_URL:
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      rootEnv.NEXT_PUBLIC_API_BASE_URL ??
      'http://localhost:3000/api',
  },
};

module.exports = nextConfig;

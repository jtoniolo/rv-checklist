//@ts-check
const fs = require('fs');
const path = require('path');

/**
 * Load the repo-root `.env` (issue #13) so the single committed `.env.example`
 * serves both apps: Next only auto-loads env files from the app directory, but
 * the owner keeps one `.env` at the workspace root. We read it here and put the
 * values in the process environment for local development, letting a real
 * process env win when set. The server reads these at runtime (ADR-0020) —
 * there is no build-time inlining any more.
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
for (const [key, value] of Object.entries(rootEnv)) {
  process.env[key] ??= value;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build a self-contained server that ships in one container (issue #171).
  // Next traces the files the server needs into `.next/standalone`; the trace
  // root is the workspace root so it follows this app's pnpm-linked workspace
  // dependencies out of `apps/web`. Next logs one warning about standalone
  // output for a monorepo and then serves.
  output: 'standalone',
  outputFileTracingRoot: path.resolve(__dirname, '../..'),
  // The shared UI lib is published as raw TypeScript/TSX source, so Next must
  // transpile it rather than treat it as pre-built node_modules.
  transpilePackages: ['@rv-checklist/web-ui'],
  async headers() {
    return [
      {
        // The service worker is the one file that must never be served stale:
        // a browser holding an old copy keeps an old precache manifest, so a
        // deploy would not reach the device (ADR-0028). The `/_next/static/`
        // immutable header is the Next.js default, so it is not set here.
        source: '/sw.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

import { workspaceRoot } from '@nx/devkit';
import { nxE2EPreset } from '@nx/playwright/preset';
import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env['BASE_URL'] ?? 'http://localhost:4200';

/**
 * The offline-charter suite (issue #156, docs/adr/0028's Playwright gap).
 * Boots the *real* API and web app — `next start` on a production build, the
 * one mode with a service worker at all (ADR-0028: "development has no
 * service worker") — against whatever Postgres `DATABASE_URL` in the repo
 * root's `.env` points at (`tools/dev/docker-compose.yml` for local runs).
 * `E2E_TEST_AUTH=true` there enables `POST /auth/e2e-login`
 * (apps/api/src/app/auth/auth.controller.ts), the sign-in this suite uses in
 * place of Google One Tap, which has no headless path.
 *
 * Not run by `nx run-many -t test` or CI (see `nx.json` — no `e2e` target in
 * the gate): it needs infrastructure (a real database, and for attachment-
 * touching assertions, S3/Garage) that the strict unit-test gate deliberately
 * has none of.
 *
 * See apps/web-e2e/e2e/support/seed.ts for how a test gets a signed-in owner
 * with seeded content, and the two spec files' doc comments for exactly
 * which charter scenarios each one exercises, and which are still manual.
 *
 * Generated as a .mts file so Node forces ESM regardless of workspace
 * `type`. Playwright routes `.mts` through its ESM loader (dynamic import,
 * bypassing the pirates CJS-compile path), and Nx's native TS strip loads
 * `.mts` directly. Playwright's configLoader auto-discovers
 * `playwright.config.mts` via its extension list
 * (.ts/.js/.mts/.mjs/.cts/.cjs).
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './e2e' }),
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  /**
   * Both processes read the workspace-root `.env` themselves (NestJS
   * `ConfigModule` / Next's own env loading) — nothing is duplicated here.
   * `reuseExistingServer` outside CI so a dev who already has both running
   * (`nx run api:serve`, `nx run web:start`) doesn't pay for a second boot.
   */
  webServer: [
    {
      command: 'pnpm exec nx run @rv-checklist/api:serve',
      url: 'http://localhost:3000/api',
      reuseExistingServer: !process.env['CI'],
      cwd: workspaceRoot,
      timeout: 120_000,
    },
    {
      command: 'pnpm exec nx run @rv-checklist/web:start',
      url: baseURL,
      reuseExistingServer: !process.env['CI'],
      cwd: workspaceRoot,
      timeout: 120_000,
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

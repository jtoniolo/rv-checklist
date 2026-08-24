import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The build's half of the service worker contract (ADR-0028, issue #150).
 *
 * `apps/web/public/sw.js` is compiled from `apps/web/sw/` after the Next build
 * and is gitignored, so nothing in this repo notices when the compile stops
 * running: `nx dev` has no worker by design, every page still renders without
 * one, and the app simply stops working offline — which is the one thing there
 * is no way to observe here. The same shape as the PowerSync asset copy
 * (ADR-0029, decision 8), for the same reason, and its sibling spec
 * `powersync-assets-contract.spec.tsx` explains the history.
 *
 * These are file-shape assertions. The worker's actual behaviour is covered by
 * `service-worker.spec.tsx`, which runs the compiled worker.
 */
describe('service worker build wiring', () => {
  const repoRoot = path.join(__dirname, '../../..');
  const webRoot = path.join(repoRoot, 'apps/web');
  const read = (relativePath: string): string =>
    readFileSync(path.join(repoRoot, relativePath), 'utf8');

  const webPackage = JSON.parse(read('apps/web/package.json')) as {
    scripts: Record<string, string>;
    nx: { targets: Record<string, { dependsOn?: string[] }> };
  };

  it('compiles the worker from the deploy’s own build command', () => {
    // The deploy documented in `docs/deployment.md` runs
    // `opennextjs-cloudflare build` directly and never goes through Nx, so this
    // is its only route to the worker. It has to come after the Next build:
    // the precache manifest describes that build's output.
    const openNextConfig = read('apps/web/open-next.config.ts');
    const buildCommand = /buildCommand:\s*"([^"]+)"/.exec(openNextConfig)?.[1];

    expect(buildCommand).toBeDefined();
    expect(buildCommand).toMatch(/next build.*&&.*sw\/build\.mjs/);
  });

  it('exposes the same compile as a target, so a local build can run it', () => {
    // What produces the worker without a full deploy. `dependsOn: ['build']`
    // is the ordering: `sw/build.mjs` reads `.next/BUILD_ID` and fails loudly
    // if the app has not been built.
    expect(webPackage.scripts['build-sw']).toContain('sw/build.mjs');
    expect(webPackage.nx.targets['build-sw']?.dependsOn).toContain('build');
  });

  it('keeps every target that serves the built app depending on the compile', () => {
    for (const target of ['start', 'serve-static']) {
      expect(webPackage.nx.targets[target]?.dependsOn).toContain('build-sw');
    }
  });

  it('never commits the compiled worker', () => {
    // It embeds one build's precache manifest, so a committed copy could only
    // ever describe some other build.
    expect(read('.gitignore')).toContain('/apps/web/public/sw.js');
  });

  it('serves the worker with headers that let a deploy reach the device', () => {
    // A browser holding a cached `/sw.js` keeps its old precache manifest, so
    // the update check has to reach the origin every time.
    const headers = read('apps/web/public/_headers');
    const swRule = headers.slice(headers.indexOf('/sw.js'));

    expect(swRule).toMatch(/Cache-Control:.*max-age=0/);
    expect(swRule).toMatch(/Cache-Control:.*must-revalidate/);
  });

  it('points the fallback at a route that exists', () => {
    // The URL is spelled in three places — the worker, the manifest builder
    // and the app router — and a typo in any of them is a fallback that fails
    // to precache, which fails the whole install and leaves no worker at all.
    const fallbackUrl = /OFFLINE_URL = '([^']+)'/.exec(
      read('apps/web/sw/index.ts'),
    )?.[1];

    expect(fallbackUrl).toBe('/offline');
    expect(read('apps/web/sw/build.mjs')).toContain(`OFFLINE_URL = '/offline'`);
    expect(
      existsSync(path.join(webRoot, 'src/app', 'offline', 'page.tsx')),
    ).toBe(true);
  });

  it('documents the worker as part of the deployment’s web build', () => {
    const deployment = read('docs/deployment.md');
    const web = deployment.slice(
      deployment.indexOf('\n## Web'),
      deployment.indexOf('\n## API'),
    );

    expect(web).toContain('sw.js');
    expect(web).toContain('_headers');
  });
});

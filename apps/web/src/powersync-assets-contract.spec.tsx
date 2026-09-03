import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The build's half of the PowerSync worker contract (ADR-0029, decision 8).
 *
 * `apps/web/public/@powersync/` is copied from the installed SDK and gitignored,
 * and the app loads `/@powersync/worker.js` by URL at runtime. Nothing in this
 * repo notices when the copy stops running: `nx dev` and `nx build` copy the
 * assets as a dependency, and a page whose worker 404s still renders — it just
 * reads from the network forever. So the failure is invisible here and only
 * appears in a deployment. The copy runs from `postinstall`, so the one step a
 * deployment cannot skip carries it; the deploy container installs with scripts
 * enabled so that hook fires (issue #171).
 *
 * These are file-shape assertions rather than behaviour, because the behaviour
 * they protect is a `pnpm install` in someone else's repository.
 */
describe('powersync worker assets', () => {
  const repoRoot = path.join(__dirname, '../../..');
  const read = (relativePath: string): string =>
    readFileSync(path.join(repoRoot, relativePath), 'utf8');
  const webPackage = JSON.parse(read('apps/web/package.json')) as {
    scripts: Record<string, string>;
    nx: { targets: Record<string, { dependsOn?: string[] }> };
  };
  const copy = webPackage.scripts['copy-powersync-assets'];

  it('copies the SDK’s assets into the directory the worker URL resolves in', () => {
    // `client.ts` opens '/@powersync/worker.js'; `-o public` is what puts the
    // file there, and the deploy container copies `public/` beside the
    // standalone server (issue #171).
    expect(copy).toContain('powersync-web copy-assets');
    expect(copy).toContain('-o public');
  });

  it('runs the copy from postinstall, so no build command can miss it', () => {
    // The one step a deployment cannot skip, and the honest place for it: the
    // assets belong to the installed SDK version.
    expect(webPackage.scripts['postinstall']).toBe(copy);
  });

  it('keeps every target that builds or serves the app depending on the copy', () => {
    // What restores the assets without a reinstall — a clean checkout of an
    // existing tree, or a `git clean`, loses them without touching the lockfile.
    for (const target of ['dev', 'build']) {
      expect(webPackage.nx.targets[target]?.dependsOn).toContain(
        'copy-powersync-assets',
      );
    }
  });

  it('installs with scripts enabled in the deploy container, so the copy runs', () => {
    // The image build is the deployment's `pnpm install` (issue #171). It must
    // not pass `--ignore-scripts`, or the `postinstall` copy never fires and
    // the image ships without the worker assets.
    const dockerfile = read('apps/web/Dockerfile');
    const install = dockerfile
      .split('\n')
      .find((line) => line.includes('pnpm install'));

    expect(install).toBeDefined();
    expect(install).not.toContain('--ignore-scripts');
  });

  it('documents the install as part of the deployment’s web build', () => {
    const deployment = readFileSync(
      path.join(repoRoot, 'docs/deployment.md'),
      'utf8',
    );
    const web = deployment.slice(
      deployment.indexOf('\n## Web'),
      deployment.indexOf('\n## API'),
    );

    expect(web).toContain('pnpm install');
    expect(web).toContain('@powersync');
  });
});

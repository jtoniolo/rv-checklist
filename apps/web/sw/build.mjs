// @ts-check
/*
 * Compiles `sw/index.ts` into `public/sw.js` (ADR-0028, issue #150).
 *
 * Runs after `next build`, from two places, for the same reason the PowerSync
 * asset copy is wired twice (ADR-0029, decision 8): `buildCommand` in
 * `open-next.config.ts` covers `opennextjs-cloudflare build`, which is the
 * deploy and never goes through Nx; the `build-sw` Nx target covers a local
 * build. `apps/web/src/service-worker-contract.spec.tsx` fails the gate if
 * either wiring is dropped, because a missing service worker is invisible in
 * this repo — every page still renders, it just renders only online.
 *
 * The precache manifest is injected as an esbuild `define`, so the emitted
 * worker's bytes change whenever a precached file does, which is what makes
 * the browser install the new worker.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(appDir, 'public');
const nextDir = path.join(appDir, '.next');
const outFile = path.join(publicDir, 'sw.js');

/** The fallback route, precached so an unvisited page has something to show. */
const OFFLINE_URL = '/offline';

/**
 * Never precached: the worker itself, the placeholder that keeps `public/` in
 * git, and `_headers` — Cloudflare consumes that one to configure the asset
 * responses and never serves it, so precaching it would 404 and, because a
 * single failed entry fails the whole install, leave the app with no worker.
 */
const PUBLIC_EXCLUDED = new Set([
  'sw.js',
  '.gitkeep',
  '_headers',
  '_redirects',
]);

/**
 * Every file under `dir`, as paths relative to it, depth first.
 *
 * @param {string} dir
 * @returns {string[]}
 */
function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(dir, path.join(entry.parentPath, entry.name)),
    );
}

/**
 * @param {string} file
 * @returns {string}
 */
function contentRevision(file) {
  return createHash('sha256')
    .update(readFileSync(file))
    .digest('hex')
    .slice(0, 16);
}

/**
 * @param {string} relativePath
 * @returns {string}
 */
function toUrl(relativePath) {
  return `/${relativePath.split(path.sep).join('/')}`;
}

/**
 * @param {string} message
 * @returns {never}
 */
function fail(message) {
  throw new Error(`sw/build.mjs: ${message}`);
}

/**
 * The precache list: what has to be on the device before it goes off grid.
 *
 * Deliberately not in here: the pages themselves. Navigations are network-first
 * and each visited page is runtime-cached (ADR-0028), so the offline copy is of
 * what the owner actually opened, not of an app shell.
 *
 * @returns {{ url: string, revision: string | null }[]}
 */
function buildManifest() {
  const buildIdFile = path.join(nextDir, 'BUILD_ID');
  if (!existsSync(buildIdFile)) {
    fail(
      `no ${path.relative(appDir, buildIdFile)} — run \`next build\` first.`,
    );
  }
  const buildId = readFileSync(buildIdFile, 'utf8').trim();

  const powersyncDir = path.join(publicDir, '@powersync');
  if (!existsSync(powersyncDir)) {
    fail(
      'public/@powersync is missing — it is produced by the `postinstall` copy ' +
        '(ADR-0029), and precaching it is what lets the local store open off grid.',
    );
  }
  // Revision from the installed SDK version, not the file bytes: these assets
  // are the SDK's, and the version is the thing that changes them.
  const powersyncVersion = JSON.parse(
    readFileSync(
      path.join(appDir, 'node_modules/@powersync/web/package.json'),
      'utf8',
    ),
  ).version;

  /** @type {{ url: string, revision: string | null }[]} */
  const entries = [
    // Rebuilt on every deploy, so the fallback the owner is shown is the one
    // this build renders.
    { url: OFFLINE_URL, revision: buildId },
  ];

  // The SDK's worker, its VFS flavours and their wasm. This is the one big
  // thing in the manifest — several megabytes, because the SDK ships every
  // wasm variant and only picks one at runtime — and it is deliberate
  // (ADR-0028): without these on the device, the local store cannot open on a
  // cold offline start, and there is nothing to render from. The cost is paid
  // once: the revision is the SDK version, so a redeploy on the same version
  // re-uses what is already cached. Source maps are the exception; they are
  // only ever fetched by a devtools window, which is online by definition.
  for (const file of filesUnder(powersyncDir)) {
    if (file.endsWith('.map')) continue;
    entries.push({
      url: `/@powersync${toUrl(file)}`,
      revision: powersyncVersion,
    });
  }

  for (const file of filesUnder(publicDir)) {
    const [top] = file.split(path.sep);
    if (top === '@powersync' || PUBLIC_EXCLUDED.has(file)) continue;
    entries.push({
      url: toUrl(file),
      revision: contentRevision(path.join(publicDir, file)),
    });
  }

  // The stylesheet, and only the stylesheet, out of the build's own assets.
  // Everything else under `/_next/static/` is left to the cache-first runtime
  // rule, which holds exactly the chunks the owner's own visits fetched —
  // precaching the lot would mean downloading every route's JavaScript plus
  // several megabytes of bundled wasm on every deploy. The stylesheet is the
  // exception because the fallback page is the one page nobody ever visits
  // online, so its styling cannot be assumed to be in that runtime cache, and
  // an unstyled fallback is not a branded one. Filenames are content-hashed,
  // hence no revision — which Serwist spells `null`, `undefined` meaning
  // "revision unknown".
  const staticDir = path.join(nextDir, 'static');
  for (const file of filesUnder(staticDir)) {
    if (!file.endsWith('.css')) continue;
    // eslint-disable-next-line unicorn/no-null
    entries.push({ url: `/_next/static${toUrl(file)}`, revision: null });
  }

  return entries;
}

const manifest = buildManifest();

await esbuild.build({
  entryPoints: [path.join(appDir, 'sw/index.ts')],
  outfile: outFile,
  bundle: true,
  // A classic worker script: `ServiceWorkerRegistrar` registers `/sw.js`
  // without `type: 'module'`, which older Android Chrome does not accept.
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  minify: true,
  sourcemap: false,
  charset: 'utf8',
  legalComments: 'none',
  define: {
    'process.env.NODE_ENV': '"production"',
    'self.__SW_MANIFEST': JSON.stringify(manifest),
  },
  banner: {
    js: '// Generated by apps/web/sw/build.mjs from apps/web/sw/index.ts. Do not edit.',
  },
});

const bytes = readFileSync(outFile).byteLength;
console.log(
  `sw/build.mjs: wrote public/sw.js (${(bytes / 1024).toFixed(1)} kB, ${manifest.length} precached entries)`,
);

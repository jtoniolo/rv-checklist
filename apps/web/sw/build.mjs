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
 * git, and Cloudflare's two config files. Cloudflare consumes `_headers` and
 * `_redirects` to configure the asset responses and never serves either, so
 * precaching one would 404 and, because a single failed entry fails the whole
 * install, leave the app with no worker. Only `_headers` exists today;
 * `_redirects` is listed so that adding it cannot quietly break the worker.
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
 * Every `/_next/static/` URL the prerendered fallback document asks the browser
 * for: its stylesheet, the framework and app chunks, and its own page chunk.
 *
 * Taken from the emitted HTML rather than from a build manifest because the
 * HTML is the artefact that is actually served, and because Turbopack emits no
 * per-route manifest to read. `/offline` stays statically prerendered — it
 * reads nothing off the request — so this file exists on every build; if it
 * ever stops existing, that is a page that started reading a request, and the
 * build fails rather than shipping a fallback with no assets.
 *
 * Why precache these at all, when `/_next/static/` is already cache-first at
 * runtime: that runtime cache holds the chunks the owner's own visits fetched,
 * and the fallback is the one page nobody ever visits online. Its styling
 * cannot be assumed to be there — an unstyled fallback is not a branded one —
 * and neither can its script, which is what works out where its links point
 * (`offline-links.tsx`). Most of these chunks are shared with every other
 * route, so the cost is one extra download of roughly 300 kB compressed on the
 * first install after a deploy; the filenames are content-hashed, so a redeploy
 * only re-fetches the chunks that actually changed.
 *
 * @returns {{ url: string, revision: string | null }[]}
 */
function fallbackPageAssets() {
  const prerendered = path.join(
    nextDir,
    'server',
    'app',
    `${OFFLINE_URL.slice(1)}.html`,
  );
  if (!existsSync(prerendered)) {
    fail(
      `no ${path.relative(appDir, prerendered)} — ${OFFLINE_URL} must stay ` +
        'statically prerendered, or its assets cannot be precached.',
    );
  }

  const html = readFileSync(prerendered, 'utf8');
  const referenced = new Set(html.match(/\/_next\/static\/[\w./-]+/g));
  const urls = [...referenced].filter((url) =>
    // The inline flight payload repeats these URLs escaped, which yields a few
    // matches with a trailing backslash; on-disk existence is what separates a
    // real asset from one of those.
    existsSync(path.join(nextDir, url.replace('/_next/', ''))),
  );

  const has = (/** @type {string} */ extension) =>
    urls.some((url) => url.endsWith(extension));
  if (!has('.css') || !has('.js')) {
    fail(
      `${path.relative(appDir, prerendered)} references no stylesheet or no ` +
        'script — the asset scrape is broken, and the fallback page would be ' +
        'precached without the files it needs.',
    );
  }

  // Content-hashed filenames, hence no revision — which Serwist spells `null`,
  // `undefined` meaning "revision unknown".
  // eslint-disable-next-line unicorn/no-null
  return urls.map((url) => ({ url, revision: null }));
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

  // The fallback page's own assets, and nothing else out of the build. Every
  // other route's JavaScript is left to the cache-first runtime rule, which
  // holds exactly the chunks the owner's own visits fetched — precaching the
  // lot would mean downloading every route's bundle plus several megabytes of
  // bundled wasm.
  entries.push(...fallbackPageAssets());

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
    // Read the same env var `next build` inlines into the client bundle
    // (`libs/web/data-access/src/lib/config.ts`) — this build never goes
    // through Next, so nothing else inlines it here (ADR-0028, issue #152:
    // the outbox flush is the one place the worker itself calls the API,
    // rather than replaying a request the page already built).
    __API_BASE_URL__: JSON.stringify(
      process.env.NEXT_PUBLIC_API_BASE_URL ?? '',
    ),
  },
  banner: {
    js: '// Generated by apps/web/sw/build.mjs from apps/web/sw/index.ts. Do not edit.',
  },
});

const bytes = readFileSync(outFile).byteLength;
console.log(
  `sw/build.mjs: wrote public/sw.js (${(bytes / 1024).toFixed(1)} kB, ${manifest.length} precached entries)`,
);

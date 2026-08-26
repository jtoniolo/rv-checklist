import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';
import { EnvSchema } from './env.js';

/**
 * The chart's half of the deployment contract lives in charts/api/values.yaml:
 * non-secret env vars are keys under `config`, and `secretKeys` names what
 * `existingSecret` must contain. This test derives the app's half — every env
 * var EnvSchema requires with no default — and fails when the chart does not
 * declare it. That gap is exactly what took production down at v0.2.9: two new
 * required secrets shipped with no chart change, and the API crash-looped.
 *
 * Deriving the required set by parsing an empty environment keeps this test
 * maintenance-free: editing env.ts is the only step, and CI points at the
 * chart when the chart is the thing left behind.
 */
describe('env / chart contract', () => {
  const valuesPath = path.join(
    __dirname,
    '../../../../../charts/api/values.yaml',
  );
  const values = parse(readFileSync(valuesPath, 'utf8')) as {
    config: Record<string, unknown>;
    secretKeys: string[];
  };

  const result = EnvSchema.safeParse({});
  const required = result.success
    ? []
    : [...new Set(result.error.issues.map((i) => String(i.path[0])))];

  it('has at least one required env var (guards the derivation itself)', () => {
    expect(required.length).toBeGreaterThan(0);
  });

  it('declares every required env var in config or secretKeys', () => {
    const declared = new Set([
      ...Object.keys(values.config),
      ...values.secretKeys,
    ]);
    const missing = required.filter((key) => !declared.has(key));
    expect(missing).toEqual([]);
  });

  it('never lists a key as both config and secret', () => {
    const overlap = values.secretKeys.filter((key) =>
      Object.hasOwn(values.config, key),
    );
    expect(overlap).toEqual([]);
  });
});

/**
 * The other half of the same drift problem: `.env.example` is the only thing
 * telling a developer (or the operator writing the cluster Secret) which
 * variables exist. A var added to EnvSchema and not documented here is found
 * the hard way — a boot failure on someone else's machine. Optional vars count:
 * COOKIE_DOMAIN is optional to the parser but decides whether auth cookies are
 * `Secure` and cross-subdomain (ADR-0019), so leaving it undocumented is how it
 * ends up unset in production.
 */
describe('env / .env.example contract', () => {
  const examplePath = path.join(__dirname, '../../../../../.env.example');
  const example = readFileSync(examplePath, 'utf8');

  // Matches both a live assignment and a commented-out one — an optional var
  // documented as `# POWERSYNC_URL=...` is documented.
  const documented = new Set<string>();
  for (const [, name] of example.matchAll(/^#?\s*([A-Z][A-Z0-9_]*)=/gm)) {
    if (name) documented.add(name);
  }

  it('documents every env var EnvSchema knows about', () => {
    const known = Object.keys(EnvSchema.shape);
    const missing = known.filter((key) => !documented.has(key));
    expect(missing).toEqual([]);
  });
});

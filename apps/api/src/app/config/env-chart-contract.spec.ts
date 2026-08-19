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

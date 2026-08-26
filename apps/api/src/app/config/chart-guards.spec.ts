import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * `helm template` guards, exercised by rendering the chart (issue: env/secret
 * checks). The env/chart contract test next door proves the chart *declares*
 * every required variable; these prove the chart *refuses to render* when a
 * declared value is left at a placeholder that would deploy a broken API.
 *
 * The failure mode each guard closes is the same one that took production down
 * at v0.2.9 — the chart rendered happily and the pod discovered the gap at
 * startup, or worse, ran with a silently wrong value.
 */
const chartDir = path.join(__dirname, '../../../../../charts/api');

/** Values that satisfy every guard — each test breaks exactly one of them. */
const VALID = {
  existingSecret: 'rv-checklist-api',
  'config.GOOGLE_CLIENT_ID': 'id.apps.googleusercontent.com',
  'config.MCP_ISSUER_URL': 'https://api.example.com',
  'config.S3_ENDPOINT': 'http://garage:3900',
  'config.S3_BUCKET': 'rv-checklist',
  'config.COOKIE_DOMAIN': '.rv.example.com',
  'config.WEB_ORIGIN': 'https://rv.example.com',
};

function render(overrides: Record<string, string> = {}): string {
  const values = { ...VALID, ...overrides };
  const args = ['template', 'test', chartDir];
  for (const [key, value] of Object.entries(values)) {
    // Helm's --set splits on commas; the allowlist-style values never contain
    // one, but escaping keeps that an assumption the test does not rely on.
    args.push('--set', `${key}=${value.replaceAll(',', String.raw`\,`)}`);
  }
  return execFileSync('helm', args, { encoding: 'utf8', stdio: 'pipe' });
}

/** Render and return the error text, failing the test if it renders cleanly. */
function renderError(overrides: Record<string, string>): string {
  try {
    render(overrides);
  } catch (error) {
    return String((error as { stderr?: Buffer }).stderr ?? error);
  }
  throw new Error('expected `helm template` to fail, but it rendered');
}

describe('api chart guards', () => {
  it('renders with a complete set of values', () => {
    expect(render()).toContain('kind: Deployment');
  });

  it.each([
    ['config.GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_ID is required'],
    ['config.MCP_ISSUER_URL', 'MCP_ISSUER_URL is required'],
    ['config.S3_ENDPOINT', 'S3_ENDPOINT is required'],
    ['config.S3_BUCKET', 'S3_BUCKET is required'],
    ['config.COOKIE_DOMAIN', 'COOKIE_DOMAIN is required'],
  ])('fails when %s is empty', (key, message) => {
    expect(renderError({ [key]: '' })).toContain(message);
  });

  it('fails when existingSecret is unset — the pod would have no secrets', () => {
    expect(renderError({ existingSecret: '' })).toContain(
      'existingSecret is required',
    );
  });

  it('fails when WEB_ORIGIN is left at the localhost default', () => {
    expect(
      renderError({ 'config.WEB_ORIGIN': 'http://localhost:4200' }),
    ).toContain('WEB_ORIGIN');
  });

  it('fails when powersync is enabled and POWERSYNC_URL is still localhost', () => {
    expect(
      renderError({
        'powersync.enabled': 'true',
        'config.POWERSYNC_URL': 'http://localhost:8080',
      }),
    ).toContain('POWERSYNC_URL');
  });

  it('renders the powersync workloads when enabled with a real POWERSYNC_URL', () => {
    const out = render({
      'powersync.enabled': 'true',
      'config.POWERSYNC_URL': 'https://sync.example.com',
    });
    expect(out).toContain('kind: CronJob');
    expect(out).toContain('PS_JWT_K');
  });

  it('binds every declared secret key with an explicit secretKeyRef', () => {
    const out = render();
    for (const key of [
      'JWT_SECRET',
      'MCP_JWT_SECRET',
      'GOOGLE_CLIENT_SECRET',
      'DATABASE_URL',
      'GOOGLE_MAPS_API_KEY',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
      'POWERSYNC_JWT_SECRET',
    ]) {
      expect(out).toContain(`key: ${key}`);
    }
  });
});

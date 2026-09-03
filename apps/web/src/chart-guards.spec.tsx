import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * `helm template` guards for the web chart, exercised by rendering it. The
 * chart declares three required config values — PUBLIC_API_BASE_URL,
 * GOOGLE_CLIENT_ID, and API_BASE_URL — and refuses to render when one is left
 * at a placeholder that would deploy a broken web tier, or when a URL value is
 * still a localhost default.
 *
 * The web pod holds no secret, so there is no existingSecret guard here.
 */
const chartDir = path.join(__dirname, '../../../charts/web');

/** Values that satisfy every guard — each test breaks exactly one of them. */
const VALID = {
  'config.PUBLIC_API_BASE_URL': 'https://api.example.com',
  'config.GOOGLE_CLIENT_ID': 'id.apps.googleusercontent.com',
  'config.API_BASE_URL': 'http://rv-checklist-api:3000',
};

function render(overrides: Record<string, string> = {}): string {
  const values = { ...VALID, ...overrides };
  const args = ['template', 'test', chartDir];
  for (const [key, value] of Object.entries(values)) {
    // Helm's --set splits on commas; the values here never contain one, but
    // escaping keeps that an assumption the test does not rely on.
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

describe('web chart guards', () => {
  it('renders a Deployment, a Service, and a ConfigMap with a complete set of values', () => {
    const out = render();
    expect(out).toContain('kind: Deployment');
    expect(out).toContain('kind: Service');
    expect(out).toContain('kind: ConfigMap');
  });

  it('puts both probes on /healthz', () => {
    const out = render();
    expect(out).toContain('readinessProbe');
    expect(out).toContain('livenessProbe');
    // Both probes name the same path, so it appears at least twice.
    expect(out.match(/path: \/healthz/g)).toHaveLength(2);
  });

  it.each([
    ['config.PUBLIC_API_BASE_URL', 'PUBLIC_API_BASE_URL is required'],
    ['config.GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_ID is required'],
    ['config.API_BASE_URL', 'API_BASE_URL is required'],
  ])('fails when %s is empty', (key, message) => {
    expect(renderError({ [key]: '' })).toContain(message);
  });

  it('fails when PUBLIC_API_BASE_URL is a localhost value', () => {
    expect(
      renderError({ 'config.PUBLIC_API_BASE_URL': 'http://localhost:3000' }),
    ).toContain('PUBLIC_API_BASE_URL');
  });

  it('fails when API_BASE_URL is a localhost value', () => {
    expect(
      renderError({ 'config.API_BASE_URL': 'http://localhost:3000' }),
    ).toContain('API_BASE_URL');
  });
});

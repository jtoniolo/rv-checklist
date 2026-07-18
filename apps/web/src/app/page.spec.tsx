import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import Index from './page';

const publicDir = path.join(__dirname, '..', '..', 'public');

describe('web shell', () => {
  it('renders the mobile-first shell', () => {
    render(<Index />);
    expect(screen.getByRole('heading', { name: /rv checklist/i })).toBeTruthy();
  });
});

describe('PWA manifest', () => {
  const manifest = JSON.parse(
    readFileSync(path.join(publicDir, 'manifest.webmanifest'), 'utf8'),
  ) as {
    name?: string;
    short_name?: string;
    start_url?: string;
    display?: string;
    icons?: { sizes?: string }[];
  };

  it('declares the fields required for installability', () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('ships 192px and 512px icons', () => {
    const sizes = (manifest.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });
});

describe('service worker', () => {
  const sw = readFileSync(path.join(publicDir, 'sw.js'), 'utf8');

  it('is a real, registerable worker (has lifecycle listeners)', () => {
    expect(sw).toMatch(/addEventListener\(\s*['"]install['"]/);
    expect(sw).toMatch(/addEventListener\(\s*['"]activate['"]/);
  });

  it('caches nothing: no Cache Storage API usage and no fetch interception', () => {
    // Assert against the code with comments stripped — the doc comment
    // legitimately says "caches nothing".
    const code = sw
      .replaceAll(/\/\*[\s\S]*?\*\//g, '')
      .replaceAll(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\bcaches\b/);
    expect(code).not.toMatch(/\bCacheStorage\b/);
    expect(code).not.toMatch(/addEventListener\(\s*['"]fetch['"]/);
  });

  it('is registered by the app shell', () => {
    const register = readFileSync(
      path.join(__dirname, 'sw-register.tsx'),
      'utf8',
    );
    expect(register).toMatch(
      /navigator\.serviceWorker\.register\(\s*['"]\/sw\.js['"]/,
    );
  });
});

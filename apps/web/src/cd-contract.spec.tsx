import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The release contract: one git tag `vX.Y.Z` makes four artifacts at one
 * version — the API image, the API chart, the web image, and the web chart
 * (ADR-0031, issue #172). CD (`.github/workflows/cd.yml`) publishes all four,
 * and the release skill (`.claude/skills/release/SKILL.md`) sets the version in
 * both charts and lints both.
 *
 * These are file-shape assertions on the workflow and the skill. `helm` and
 * `docker` are not run here; the chart's own render behaviour lives in
 * `chart-guards.spec.tsx`.
 */
describe('release contract: four artifacts from one tag', () => {
  const repoRoot = path.join(__dirname, '../../..');
  const read = (relativePath: string): string =>
    readFileSync(path.join(repoRoot, relativePath), 'utf8');

  const cd = read('.github/workflows/cd.yml');
  const skill = read('.claude/skills/release/SKILL.md');

  describe('the CD workflow', () => {
    it('builds and pushes the web image from apps/web/Dockerfile', () => {
      expect(cd).toContain('ghcr.io/jtoniolo/rv-checklist-web');
      expect(cd).toContain('apps/web/Dockerfile');
    });

    it('still builds and pushes the API image from apps/api/Dockerfile', () => {
      expect(cd).toContain('ghcr.io/jtoniolo/rv-checklist-api');
      expect(cd).toContain('apps/api/Dockerfile');
    });

    it('packages and pushes the web chart to the charts registry', () => {
      expect(cd).toMatch(/helm package charts\/web/);
      expect(cd).toContain('rv-checklist-web-');
      expect(cd).toContain('oci://ghcr.io/jtoniolo/charts');
    });

    it('still packages and pushes the API chart', () => {
      expect(cd).toMatch(/helm package charts\/api/);
      expect(cd).toContain('rv-checklist-api-');
    });

    it('drift-guards both charts and names the chart in each failure', () => {
      // The version resolution runs the guard once per chart, before anything
      // is published.
      expect(cd).toContain('charts/api/Chart.yaml');
      expect(cd).toContain('charts/web/Chart.yaml');
      // Each drift message names the chart it read (through the chart-file
      // variable), so a failure points at the file to fix.
      expect(cd).toMatch(/\$\{chart_file\} has version/);
      expect(cd).toMatch(/\$\{chart_file\} has appVersion/);
    });
  });

  describe('the release skill', () => {
    it('sets the version in both charts', () => {
      expect(skill).toContain('charts/api/Chart.yaml');
      expect(skill).toContain('charts/web/Chart.yaml');
    });

    it('lints both charts in preflight', () => {
      expect(skill).toMatch(/helm lint charts\/api/);
      expect(skill).toMatch(/helm lint charts\/web/);
    });
  });
});

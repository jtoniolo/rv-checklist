import { equivalentPath } from './equivalent-path';

/**
 * The rig-switch path mapping (issue #62): switching rigs keeps the section
 * but drops entity segments, and sections without a rig-scoped index route
 * (runs) land on the section they're reached from (checklists).
 */
describe('equivalentPath', () => {
  it('keeps the section and drops entity segments', () => {
    expect(equivalentPath('/rig/abc/maintenance/task123', 'xyz')).toBe(
      '/rig/xyz/maintenance',
    );
  });

  it('maps the rig home to the new rig home', () => {
    expect(equivalentPath('/rig/abc', 'xyz')).toBe('/rig/xyz');
  });

  it('maps a run detail to the checklists list (no runs index route)', () => {
    expect(equivalentPath('/rig/abc/runs/run123', 'xyz')).toBe(
      '/rig/xyz/checklists',
    );
  });

  it('maps the trips list to the new rig trips list (issue #114)', () => {
    expect(equivalentPath('/rig/abc/trips', 'xyz')).toBe('/rig/xyz/trips');
  });

  it('maps a trip detail to the trips list (issue #114)', () => {
    expect(equivalentPath('/rig/abc/trips/trip123', 'xyz')).toBe(
      '/rig/xyz/trips',
    );
  });

  it('maps deeper trip sub-routes (new, edit) to the trips list (issue #114)', () => {
    expect(equivalentPath('/rig/abc/trips/new', 'xyz')).toBe('/rig/xyz/trips');
    expect(equivalentPath('/rig/abc/trips/trip123/edit', 'xyz')).toBe(
      '/rig/xyz/trips',
    );
  });
});

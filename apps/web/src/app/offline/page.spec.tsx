import { render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import OfflinePage from './page';

const RIG_ID = '550e8400-e29b-41d4-a716-446655440010';

function setLastRigCookie(value: string): void {
  document.cookie = `rv.last-rig=${value}; path=/`;
}

function clearCookies(): void {
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=', 1)[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
}

function hrefFor(label: string): string | null {
  return screen.getByRole('link', { name: label }).getAttribute('href');
}

describe('offline fallback page (issue #150)', () => {
  beforeEach(clearCookies);
  afterEach(clearCookies);

  it('offers the rig manager when the device has no rig hint', () => {
    render(<OfflinePage />);

    expect(hrefFor('Your rigs')).toBe('/rigs');
    expect(screen.queryByRole('link', { name: 'Rig home' })).toBeNull();
  });

  it('offers the rig home and the trips list once the hint cookie is set', () => {
    setLastRigCookie(RIG_ID);

    render(<OfflinePage />);

    // The rig home is the dashboard, and the dashboard leads with the
    // current-trip card (issue #118) — between them these are the two the
    // ticket asks the fallback to link to.
    expect(hrefFor('Rig home')).toBe(`/rig/${RIG_ID}`);
    expect(hrefFor('Trips')).toBe(`/rig/${RIG_ID}/trips`);
    expect(hrefFor('Your rigs')).toBe('/rigs');
  });

  /**
   * The links have to come from the browser, not the server. The worker
   * precaches this page during `install`, which on a new device runs at
   * `/welcome` — before any rig has been opened and before `rv.last-rig`
   * exists — and a precache entry whose revision has not changed is never
   * re-fetched, so whatever the server rendered then is frozen until the next
   * deploy. This asserts the server render carries no rig at all, which is
   * also what keeps the credentialed capture free of anything owner-specific.
   */
  it('renders no rig anywhere in the markup the worker captures', () => {
    setLastRigCookie(RIG_ID);

    const captured = renderToString(<OfflinePage />);

    expect(captured).not.toContain(RIG_ID);
    expect(captured).toContain('/rigs');
  });

  it('survives a cookie jar that holds no rig hint at all', () => {
    document.cookie = 'rv.theme=dark; path=/';

    render(<OfflinePage />);

    expect(screen.queryByRole('link', { name: 'Rig home' })).toBeNull();
    expect(hrefFor('Your rigs')).toBe('/rigs');
  });
});

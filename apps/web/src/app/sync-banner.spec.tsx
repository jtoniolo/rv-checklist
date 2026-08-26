import { setSyncAuthStatus } from '@rv-checklist/web-data-access';
import { act, render, screen } from '@testing-library/react';
import { StoreProvider } from './store-provider';
import { SyncSignInBanner } from './sync-banner';

function renderBanner(): void {
  render(
    <StoreProvider>
      <SyncSignInBanner />
    </StoreProvider>,
  );
}

/**
 * The app-wide "sign in to sync" banner (issue #149; ADR-0028). It renders
 * nothing while sync is authenticated, and — since the offline shell keeps
 * rendering local data with no session check offline — it has to work
 * whether or not the app is otherwise signed in.
 */
describe('SyncSignInBanner', () => {
  afterEach(() => {
    act(() => {
      setSyncAuthStatus('ok');
    });
  });

  it('renders nothing while sync is authenticated', () => {
    renderBanner();

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('invites sign-in when the queue is held for want of a session', () => {
    setSyncAuthStatus('ok');
    renderBanner();

    act(() => {
      setSyncAuthStatus('signed-out');
    });

    const banner = screen.getByRole('status');
    expect(banner.textContent).toContain('Sign in to sync');
  });

  it('explains, distinctly, when a different account is signed in', () => {
    renderBanner();

    act(() => {
      setSyncAuthStatus('owner-mismatch');
    });

    const banner = screen.getByRole('status');
    expect(banner.textContent).toContain('different account');
  });

  it('clears once sync is authenticated again', () => {
    renderBanner();

    act(() => {
      setSyncAuthStatus('signed-out');
    });
    act(() => {
      setSyncAuthStatus('ok');
    });

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows straight away on a mount that is already held', () => {
    setSyncAuthStatus('signed-out');

    renderBanner();

    expect(screen.getByRole('status').textContent).toContain('Sign in to sync');
  });
});

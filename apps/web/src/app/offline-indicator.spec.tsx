import { fireEvent, render, screen } from '@testing-library/react';
import { OfflineIndicator } from './offline-indicator';

/**
 * Issue #153's first acceptance criterion: cutting the network flips the
 * indicator without a reload, and restoring it clears it.
 *
 * jsdom has no Worker or IndexedDB, so there is no local store here and the
 * sync-connection half of `useIsOffline` stays inert — which is the point of
 * the fallback. The sync half is covered against a fake database in
 * `libs/web/data-access/src/lib/connectivity.spec.ts`.
 */

/** Cut or restore the network the way a browser reports it. */
function setNetwork(isOnline: boolean): void {
  (navigator as unknown as { onLine: boolean }).onLine = isOnline;
  fireEvent(
    globalThis as Window & typeof globalThis,
    new Event(isOnline ? 'online' : 'offline'),
  );
}

describe('OfflineIndicator', () => {
  afterEach(() => {
    (navigator as unknown as { onLine: boolean }).onLine = true;
  });

  it('renders nothing while the device is online', () => {
    render(<OfflineIndicator />);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('appears when the network is cut, with no reload', () => {
    render(<OfflineIndicator />);

    setNetwork(false);

    expect(screen.getByRole('status').textContent).toContain('Offline');
  });

  it('clears when the network comes back', () => {
    render(<OfflineIndicator />);

    setNetwork(false);
    setNetwork(true);

    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows straight away on a mount that is already offline', () => {
    (navigator as unknown as { onLine: boolean }).onLine = false;

    render(<OfflineIndicator />);

    expect(screen.getByRole('status').textContent).toContain('Offline');
  });
});

import { OUTBOX_BROADCAST_CHANNEL } from '@rv-checklist/domain';
import { setSyncAuthStatus } from '@rv-checklist/web-data-access';
import { act, render, screen, waitFor } from '@testing-library/react';
import { AttachmentOutboxBridge } from './attachment-outbox-bridge';
import { StoreProvider } from './store-provider';
import { SyncSignInBanner } from './sync-banner';

/**
 * The 401-to-banner bridge (ADR-0028, issue #152) — proof that the worker's
 * broadcast actually drives `SyncSignInBanner` (#149), the same UI a
 * page-side connector 401 already renders, rather than a parallel path.
 */
describe('AttachmentOutboxBridge', () => {
  afterEach(() => {
    act(() => {
      setSyncAuthStatus('ok');
    });
  });

  it('makes the "sign in to sync" banner appear on an outbox-auth-required broadcast', async () => {
    render(
      <StoreProvider>
        <SyncSignInBanner />
        <AttachmentOutboxBridge />
      </StoreProvider>,
    );
    expect(screen.queryByRole('status')).toBeNull();

    const channel = new BroadcastChannel(OUTBOX_BROADCAST_CHANNEL);
    channel.postMessage({ type: 'rv-checklist/outbox-auth-required' });
    channel.close();

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain(
        'Sign in to sync',
      );
    });
  });
});

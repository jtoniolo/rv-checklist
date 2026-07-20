import {
  selectIsAuthenticated,
  useAppSelector,
  useHasHydrated,
} from '@rv-checklist/web-data-access';
import { act, type JSX } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { StoreProvider } from './store-provider';

/**
 * A component gated on hydration, exactly as `Home` is: it renders a neutral
 * placeholder until mounted, then the auth-dependent surface. This is the shape
 * that keeps the localStorage-persisted session from flashing the signed-out
 * sign-in UI (and Google One Tap) on every reload.
 */
function GatedSurface(): JSX.Element {
  const isHydrated = useHasHydrated();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  if (!isHydrated) {
    return <div data-testid="status">loading</div>;
  }
  return (
    <div data-testid="status">
      {isAuthenticated ? 'signed-in' : 'sign-in-surface'}
    </div>
  );
}

function Tree(): JSX.Element {
  return (
    <StoreProvider>
      <GatedSurface />
    </StoreProvider>
  );
}

describe('auth session across an SSR reload', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('hydrates without a mismatch and restores the persisted session', async () => {
    // 1. Server render: the Node server has no localStorage → neutral placeholder.
    localStorage.clear();
    const serverHtml = renderToString(<Tree />);
    expect(serverHtml).toContain('loading');
    expect(serverHtml).not.toContain('sign-in-surface');

    // 2. The persisted session the browser carries into the reload.
    localStorage.setItem('rv.accessToken', 'access-1');
    localStorage.setItem('rv.refreshToken', 'refresh-1');

    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    document.body.append(container);

    // 3. Client hydrate over the server HTML, exactly as the browser does.
    const onRecoverableError = jest.fn();
    await act(async () => {
      hydrateRoot(container, <Tree />, { onRecoverableError });
      // Let the mount effect (which flips the hydration gate) flush.
      await Promise.resolve();
    });

    // No hydration mismatch: the signed-out surface never flashed, so Google
    // One Tap never mounted to re-authenticate the owner.
    expect(onRecoverableError).not.toHaveBeenCalled();
    // And the owner's live session is reflected — no sign-in required.
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe(
      'signed-in',
    );
  });
});

import {
  selectIsAuthenticated,
  signedIn,
  useAppSelector,
  useAppStore,
  useHasHydrated,
} from '@rv-checklist/web-data-access';
import { act, useEffect, type JSX } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { StoreProvider } from './store-provider';

/**
 * A component gated on hydration, exactly as `Home` is: it renders a neutral
 * placeholder until mounted, then the auth-dependent surface. With httpOnly
 * cookies (ADR-0019) the session is invisible to JavaScript; the auth slice
 * starts unsigned-in and is flipped by a successful `/me` probe after mount.
 * This test simulates that by dispatching `signedIn` in a mount effect.
 */
function GatedSurface(): JSX.Element {
  const isHydrated = useHasHydrated();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const store = useAppStore();

  useEffect(() => {
    store.dispatch(signedIn());
  }, [store]);

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
  it('hydrates without a mismatch and resolves the session after mount', async () => {
    const serverHtml = renderToString(<Tree />);
    expect(serverHtml).toContain('loading');
    expect(serverHtml).not.toContain('sign-in-surface');

    const container = document.createElement('div');
    container.innerHTML = serverHtml;
    document.body.append(container);

    const onRecoverableError = jest.fn();
    await act(async () => {
      hydrateRoot(container, <Tree />, { onRecoverableError });
      await Promise.resolve();
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="status"]')?.textContent).toBe(
      'signed-in',
    );
  });
});

import { act, render, waitFor } from '@testing-library/react';
import { ServiceWorkerRegistrar } from './sw-register';

/**
 * The registrar decides two things the rest of the repo cannot see going
 * wrong: that a production page registers `/sw.js` once the load event has
 * been and gone, and that a development page registers nothing and clears
 * whatever a previous production build left behind. The second is what stops a
 * stale worker cache-firsting `/_next/static/` against the dev server and
 * handing back yesterday's chunks.
 *
 * The registration URL carries the runtime API base URL (ADR-0020): the worker
 * reads it from its own location, so the published image needs no compile-time
 * constant. `test-setup.ts` seeds `window.__PUBLIC_CONFIG__` with
 * `https://api.test`, hence the encoded `?api=` param below.
 */
const SW_URL = `/sw.js?api=${encodeURIComponent('https://api.test')}`;

interface FakeServiceWorkerContainer {
  register: jest.Mock;
  getRegistrations: jest.Mock;
}

const NODE_ENV = process.env.NODE_ENV;

function installContainer(
  container: FakeServiceWorkerContainer | undefined,
): void {
  if (container === undefined) {
    Reflect.deleteProperty(navigator, 'serviceWorker');
    return;
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    value: container,
    configurable: true,
  });
}

function fakeContainer(
  unregister: jest.Mock = jest.fn().mockResolvedValue(true),
): FakeServiceWorkerContainer {
  return {
    register: jest.fn().mockResolvedValue({}),
    getRegistrations: jest.fn().mockResolvedValue([{ unregister }]),
  };
}

function setNodeEnv(value: string): void {
  Object.assign(process.env, { NODE_ENV: value });
}

function setReadyState(value: DocumentReadyState): void {
  Object.defineProperty(document, 'readyState', {
    configurable: true,
    get: () => value,
  });
}

describe('ServiceWorkerRegistrar (issue #150)', () => {
  afterEach(() => {
    setNodeEnv(NODE_ENV);
    setReadyState('complete');
    installContainer(undefined);
  });

  it('registers the worker on a production page', async () => {
    setNodeEnv('production');
    const container = fakeContainer();
    installContainer(container);

    render(<ServiceWorkerRegistrar />);

    await waitFor(() => {
      expect(container.register).toHaveBeenCalledWith(SW_URL);
    });
    expect(container.getRegistrations).not.toHaveBeenCalled();
  });

  it('waits for the load event when the document is still loading', async () => {
    setNodeEnv('production');
    setReadyState('loading');
    const container = fakeContainer();
    installContainer(container);

    render(<ServiceWorkerRegistrar />);
    expect(container.register).not.toHaveBeenCalled();

    act(() => {
      globalThis.dispatchEvent(new Event('load'));
    });

    await waitFor(() => {
      expect(container.register).toHaveBeenCalledWith(SW_URL);
    });
  });

  it('registers nothing in development and unregisters a build left over', async () => {
    setNodeEnv('development');
    const unregister = jest.fn().mockResolvedValue(true);
    const container = fakeContainer(unregister);
    installContainer(container);

    render(<ServiceWorkerRegistrar />);

    await waitFor(() => {
      expect(unregister).toHaveBeenCalled();
    });
    expect(container.register).not.toHaveBeenCalled();
  });

  it('carries on when the browser will not list its registrations', async () => {
    setNodeEnv('development');
    const container = fakeContainer();
    container.getRegistrations.mockRejectedValue(new Error('not allowed'));
    installContainer(container);

    render(<ServiceWorkerRegistrar />);

    await waitFor(() => {
      expect(container.getRegistrations).toHaveBeenCalled();
    });
    expect(container.register).not.toHaveBeenCalled();
  });

  it('does nothing on a browser with no service worker support', () => {
    setNodeEnv('production');
    installContainer(undefined);

    expect(() => render(<ServiceWorkerRegistrar />)).not.toThrow();
  });
});

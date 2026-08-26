/**
 * Middleware seam tests: pure request-in/response-out. No server, no browser —
 * we construct NextRequest objects, call `middleware()`, and assert the
 * NextResponse. Covers:
 *   - public paths pass through
 *   - guarded paths without a session redirect to /welcome with returnTo
 *   - guarded paths with a valid session pass through
 *   - near-expiry triggers silent refresh and forwards Set-Cookie
 *   - failed refresh redirects to /welcome
 */

import { NextRequest } from 'next/server';

function fakeJwt(exp: number): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = btoa(
    JSON.stringify({ sub: 'user-1', email: 'a@b.com', exp }),
  );
  return `${header}.${payload}.fake-sig`;
}

async function loadMiddleware(): Promise<typeof import('./middleware')> {
  jest.resetModules();
  return import('./middleware');
}

function makeRequest(
  path: string,
  cookies?: Record<string, string>,
): NextRequest {
  const url = `https://app.test${path}`;
  const req = new NextRequest(url);
  if (cookies) {
    for (const [name, value] of Object.entries(cookies)) {
      req.cookies.set(name, value);
    }
  }
  return req;
}

function locationOf(res: Response): URL {
  const raw = res.headers.get('location');
  if (!raw) throw new Error('Expected a Location header');
  return new URL(raw);
}

describe('edge middleware', () => {
  let fetchSpy: jest.SpiedFunction<typeof globalThis.fetch>;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = 'https://api.test/api';
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('public paths pass through', () => {
    it.each([
      '/welcome',
      '/welcome?returnTo=/rigs',
      '/_next/static/chunk.js',
      '/manifest.webmanifest',
      '/icons/icon-192.png',
      '/favicon.ico',
      '/sw.js',
      '/offline',
      '/@powersync/worker.js',
      '/@powersync/assets/wa-sqlite-async.wasm',
    ])('%s', async (path) => {
      const { middleware } = await loadMiddleware();
      const res = await middleware(makeRequest(path));
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });
  });

  describe('redirect to welcome', () => {
    it('redirects to /welcome with returnTo when no access cookie', async () => {
      const { middleware } = await loadMiddleware();
      const res = await middleware(makeRequest('/rigs/123'));
      expect(res.status).toBe(307);
      const location = locationOf(res);
      expect(location.pathname).toBe('/welcome');
      expect(location.searchParams.get('returnTo')).toBe('/rigs/123');
    });

    it('preserves the returnTo path for the root route', async () => {
      const { middleware } = await loadMiddleware();
      const res = await middleware(makeRequest('/'));
      expect(res.status).toBe(307);
      const location = locationOf(res);
      expect(location.searchParams.get('returnTo')).toBe('/');
    });
  });

  describe('valid session passes through', () => {
    it('allows a request with a non-expired access token', async () => {
      const { middleware } = await loadMiddleware();
      const futureExp = Math.floor(Date.now() / 1000) + 600;
      const req = makeRequest('/rigs', { 'rv.access': fakeJwt(futureExp) });
      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.get('location')).toBeNull();
    });
  });

  describe('silent refresh', () => {
    it('refreshes near-expiry tokens and forwards Set-Cookie', async () => {
      const { middleware } = await loadMiddleware();
      const nearExp = Math.floor(Date.now() / 1000) + 30;
      const req = makeRequest('/rigs', {
        'rv.access': fakeJwt(nearExp),
        'rv.refresh': 'opaque-refresh-value',
      });

      const mockCookieHeader =
        'rv.access=new-jwt; HttpOnly; Path=/; SameSite=Lax';
      fetchSpy.mockResolvedValue({
        ok: true,
        headers: {
          getSetCookie: () => [
            mockCookieHeader,
            'rv.refresh=new-refresh; HttpOnly; Path=/; SameSite=Lax',
          ],
        },
      } as unknown as Response);

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.getSetCookie()).toContain(mockCookieHeader);

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.test/api/auth/refresh',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('refreshes when the access cookie is gone but a refresh cookie remains', async () => {
      const { middleware } = await loadMiddleware();
      const req = makeRequest('/rigs', {
        'rv.refresh': 'opaque-refresh-value',
      });

      const mockCookieHeader =
        'rv.access=new-jwt; HttpOnly; Path=/; SameSite=Lax';
      fetchSpy.mockResolvedValue({
        ok: true,
        headers: {
          getSetCookie: () => [
            mockCookieHeader,
            'rv.refresh=new-refresh; HttpOnly; Path=/; SameSite=Lax',
          ],
        },
      } as unknown as Response);

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(res.headers.getSetCookie()).toContain(mockCookieHeader);
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.test/api/auth/refresh',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('redirects to welcome when refresh fails', async () => {
      const { middleware } = await loadMiddleware();
      const nearExp = Math.floor(Date.now() / 1000) + 30;
      const req = makeRequest('/rigs', {
        'rv.access': fakeJwt(nearExp),
        'rv.refresh': 'opaque-refresh-value',
      });

      fetchSpy.mockResolvedValue({
        ok: false,
        status: 401,
        headers: { getSetCookie: () => [] },
      } as unknown as Response);

      const res = await middleware(req);
      expect(res.status).toBe(307);
      expect(locationOf(res).pathname).toBe('/welcome');
    });

    it('passes through if refresh throws (network error)', async () => {
      const { middleware } = await loadMiddleware();
      const nearExp = Math.floor(Date.now() / 1000) + 30;
      const req = makeRequest('/rigs', {
        'rv.access': fakeJwt(nearExp),
        'rv.refresh': 'opaque-refresh-value',
      });

      fetchSpy.mockRejectedValue(new Error('network down'));

      const res = await middleware(req);
      expect(res.status).toBe(200);
    });

    it('skips refresh if no refresh cookie even when near expiry', async () => {
      const { middleware } = await loadMiddleware();
      const nearExp = Math.floor(Date.now() / 1000) + 30;
      const req = makeRequest('/rigs', { 'rv.access': fakeJwt(nearExp) });

      const res = await middleware(req);
      expect(res.status).toBe(200);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});

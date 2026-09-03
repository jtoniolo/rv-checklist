import { NextRequest, NextResponse } from 'next/server';

const ACCESS_COOKIE = 'rv.access';
const REFRESH_COOKIE = 'rv.refresh';

/**
 * Paths that never require a session.
 *
 * The proxy runs on the Node runtime and sees every request in every
 * environment, so these prefixes carry the whole contract.
 *
 * `/healthz` is here so a container probe reaches the health route with no
 * session (issue #167).
 *
 * The service-worker prefixes are here for the same reason (ADR-0028). The
 * browser re-fetches the worker script to check for an update, and the worker
 * itself fetches the fallback page and the PowerSync assets when it installs.
 * None of those is a navigation, so a redirect to `/welcome` cannot sign anyone
 * in — it just hands back HTML where a script, a wasm module or the offline
 * page was expected — and during `install`, a poisoned precache entry or a
 * failed install. The assets are the SDK's own bytes, identical for every user,
 * so a session buys nothing here either way.
 */
const PUBLIC_PREFIXES = [
  '/welcome',
  '/healthz',
  '/_next/',
  '/manifest.webmanifest',
  '/icons/',
  '/favicon.ico',
  '/sw.js',
  '/offline',
  '/@powersync/',
];

/** Seconds before expiry at which we trigger a silent refresh. */
const REFRESH_AHEAD_SECS = 60;

/**
 * Decode the payload of a JWT without verification. The API verifies
 * authenticity on every request; the proxy only needs the `exp` claim to decide
 * whether to refresh.
 */
function decodeJwtPayload(
  token: string,
): { exp?: number; sub?: string } | undefined {
  const parts = token.split('.');
  const payloadB64 = parts[1];
  if (!payloadB64) return undefined;
  try {
    const json = atob(payloadB64.replaceAll('-', '+').replaceAll('_', '/'));
    return JSON.parse(json) as { exp?: number; sub?: string };
  } catch {
    return undefined;
  }
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isNearExpiry(token: string, now: number): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  return payload.exp - now / 1000 <= REFRESH_AHEAD_SECS;
}

/**
 * Build an absolute API URL from the env-provided base. This runs on the server
 * (Node runtime), so it prefers the server-only `API_BASE_URL`, then the public
 * `PUBLIC_API_BASE_URL` (ADR-0020). Falls back to the request origin + `/api` if
 * neither is set (local development).
 */
function apiUrl(path: string, requestUrl: URL): string {
  const base =
    process.env.API_BASE_URL ??
    process.env.PUBLIC_API_BASE_URL ??
    `${requestUrl.origin}/api`;
  return `${base}${path}`;
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  // No session at all — redirect to welcome.
  if (!accessToken && !refreshToken) {
    return redirectToWelcome(request);
  }

  // Access cookie expired and dropped by the browser, but the long-lived
  // refresh cookie remains — refresh instead of forcing a new sign-in. A
  // network failure here means we have no usable session, so fall back to
  // welcome.
  if (!accessToken) {
    return silentRefresh(request, redirectToWelcome(request));
  }

  // Token present but near expiry — attempt silent refresh. On network
  // failure the still-valid access token can serve this request.
  if (refreshToken && isNearExpiry(accessToken, Date.now())) {
    return silentRefresh(request, NextResponse.next());
  }

  return NextResponse.next();
}

function redirectToWelcome(request: NextRequest): NextResponse {
  const welcomeUrl = new URL('/welcome', request.url);
  welcomeUrl.searchParams.set('returnTo', request.nextUrl.pathname);
  return NextResponse.redirect(welcomeUrl);
}

async function silentRefresh(
  request: NextRequest,
  onNetworkError: NextResponse,
): Promise<NextResponse> {
  try {
    const refreshUrl = apiUrl('/auth/refresh', request.nextUrl);
    const apiResponse = await fetch(refreshUrl, {
      method: 'POST',
      headers: { cookie: request.headers.get('cookie') ?? '' },
    });

    if (!apiResponse.ok) {
      return redirectToWelcome(request);
    }

    const response = NextResponse.next();
    for (const cookie of apiResponse.headers.getSetCookie()) {
      response.headers.append('set-cookie', cookie);
    }
    return response;
  } catch {
    return onNetworkError;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};

import { NextResponse } from 'next/server';

/**
 * Liveness and readiness probe (issue #167). The proxy lists `/healthz` among
 * the public prefixes, so a probe reaches this handler with no session. It
 * answers 200 with a small JSON body and reports no dependency, so a green
 * response means the Node server accepts requests.
 */
export function GET(): NextResponse {
  return NextResponse.json({ status: 'ok' });
}

/**
 * Health route test (issue #167): the handler answers 200 with a small JSON
 * body and needs no session. The proxy lists `/healthz` among the public
 * prefixes, so a probe reaches this handler without a cookie.
 */

import { GET } from './route';

describe('/healthz route', () => {
  it('answers 200 with a JSON status body', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    await expect(res.json()).resolves.toEqual({ status: 'ok' });
  });
});

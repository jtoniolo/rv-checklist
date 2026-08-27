// Service worker holding TWO precached artifacts per route pattern:
//   1. the App Shell HTML document
//   2. the /_full segment payload the shell resumes from
// Both were fetched once, online, from an arbitrary concrete URL.
// OFFLINE=1 makes every other request fail, as off grid.
import http from 'node:http';
import fs from 'node:fs';

const SHELL = fs.readFileSync('.next/server/app/thing/[id].html');
const FULL = fs.readFileSync('cached-full-segment.bin');
const ORIGIN = 'http://127.0.0.1:4319';
const OFFLINE = process.env.OFFLINE === '1';

http
  .createServer(async (req, res) => {
    const path = req.url.split('?')[0];
    const inPattern = /^\/thing\/[^/]+$/.test(path);
    const isNav = req.headers['sec-fetch-mode'] === 'navigate' && !req.headers['rsc'];

    if (inPattern && isNav) {
      console.log('[sw] shell ->', req.url);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(SHELL);
    }
    if (inPattern && req.headers['rsc'] === '1') {
      console.log('[sw] cached /_full ->', req.url, 'seg=', req.headers['next-router-segment-prefetch']);
      res.writeHead(200, {
        'content-type': 'text/x-component',
        'x-nextjs-postponed': '2',
        'x-nextjs-prerender': '1',
        vary: 'rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch',
      });
      return res.end(FULL);
    }
    if (OFFLINE && !path.startsWith('/_next/static')) {
      console.log('[sw] OFFLINE fail ->', req.url);
      res.destroy();
      return;
    }
    try {
      const up = await fetch(ORIGIN + req.url, { headers: { ...req.headers, host: '127.0.0.1:4319' } });
      const buf = Buffer.from(await up.arrayBuffer());
      const h = Object.fromEntries(up.headers);
      delete h['content-encoding']; delete h['content-length']; delete h['transfer-encoding'];
      res.writeHead(up.status, h);
      res.end(buf);
    } catch { res.writeHead(502); res.end(); }
  })
  .listen(Number(process.env.PORT || 4333), () => console.log('sw2 on', process.env.PORT, 'OFFLINE=', OFFLINE));

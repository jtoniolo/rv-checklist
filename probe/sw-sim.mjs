// Simulates a service worker holding ONE precached App Shell document for the
// /thing/[id] route pattern, served for any navigation matching that pattern.
// Non-navigation requests (RSC resume, segment prefetch, assets) go to the network,
// unless OFFLINE=1, in which case they fail — the off-grid case.
import http from 'node:http';
import fs from 'node:fs';

const SHELL = fs.readFileSync('.next/server/app/thing/[id].html');
const ORIGIN = 'http://127.0.0.1:4319';
const OFFLINE = process.env.OFFLINE === '1';

const isNavigation = (req) =>
  req.headers['sec-fetch-mode'] === 'navigate' && !req.headers['rsc'];

http
  .createServer(async (req, res) => {
    const path = req.url.split('?')[0];
    if (/^\/thing\/[^/]+$/.test(path) && isNavigation(req)) {
      console.log('[sw-sim] SHELL served for navigation', req.url);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(SHELL);
    }
    if (OFFLINE && !path.startsWith('/_next/static')) {
      console.log('[sw-sim] OFFLINE -> network failure for', req.url);
      res.destroy();
      return;
    }
    try {
      const upstream = await fetch(ORIGIN + req.url, { headers: { ...req.headers, host: '127.0.0.1:4319' } });
      const buf = Buffer.from(await upstream.arrayBuffer());
      const h = Object.fromEntries(upstream.headers);
      delete h['content-encoding'];
      delete h['content-length'];
      delete h['transfer-encoding'];
      console.log('[sw-sim] network', upstream.status, req.url);
      res.writeHead(upstream.status, h);
      res.end(buf);
    } catch (e) {
      console.log('[sw-sim] upstream fail', req.url, e.message);
      res.writeHead(502);
      res.end();
    }
  })
  .listen(Number(process.env.PORT || 4330), () =>
    console.log('sw-sim on', process.env.PORT || 4330, 'OFFLINE=', OFFLINE)
  );

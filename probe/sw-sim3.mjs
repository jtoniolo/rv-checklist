import http from 'node:http';
import fs from 'node:fs';
const SHELL = fs.readFileSync('.next/server/app/serverthing/[id].html');
const FULL = fs.readFileSync('cached-sfull.bin');
http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  const inPattern = /^\/serverthing\/[^/]+$/.test(path);
  if (inPattern && req.headers['sec-fetch-mode'] === 'navigate' && !req.headers['rsc']) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(SHELL);
  }
  if (inPattern && req.headers['rsc'] === '1') {
    res.writeHead(200, { 'content-type': 'text/x-component', 'x-nextjs-postponed': '2', 'x-nextjs-prerender': '1' });
    return res.end(FULL);
  }
  if (path.startsWith('/_next/static')) {
    fetch('http://127.0.0.1:4340' + req.url).then(async (u) => {
      const b = Buffer.from(await u.arrayBuffer());
      res.writeHead(u.status, { 'content-type': u.headers.get('content-type') || 'application/octet-stream' });
      res.end(b);
    });
    return;
  }
  res.destroy();
}).listen(4334, () => console.log('sw3 offline on 4334'));

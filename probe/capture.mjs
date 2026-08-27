import pw from '/var/home/jeff/repo/rv-checklist/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.js';
import fs from 'node:fs';
const { chromium } = pw;

const [url, out] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();
const caught = [];
page.on('response', async (r) => {
  const u = new URL(r.url());
  if (u.pathname.startsWith('/thing/') && u.searchParams.has('_rsc')) {
    let body = null;
    try { body = await r.body(); } catch {}
    caught.push({ url: r.url(), status: r.status(), headers: r.request().headers(), size: body?.length ?? -1 });
    if (body) fs.writeFileSync(out, body);
  }
});
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
console.log(JSON.stringify(caught, null, 2));
await browser.close();

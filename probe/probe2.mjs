import pw from '/var/home/jeff/repo/rv-checklist/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.js';
const { chromium } = pw;
const b = await chromium.launch(); const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(process.argv[2], { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4000);
console.log(JSON.stringify(await p.evaluate(() => ({
  serverFallbackStillThere: !!document.querySelector('[data-testid="server-fallback"]'),
  serverId: document.querySelector('[data-testid="server-id"]')?.textContent ?? null,
  body: document.body.innerText.replace(/\s+/g,' ').slice(0,200),
})), null, 2));
console.log('errors:', JSON.stringify(errs.slice(0,3)));
await b.close();

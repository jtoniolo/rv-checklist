import pw from '/var/home/jeff/repo/rv-checklist/node_modules/.pnpm/playwright-core@1.62.1/node_modules/playwright-core/index.js';
const { chromium } = pw;

const url = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);

const out = await page.evaluate(() => ({
  fallbackStillThere: !!document.querySelector('[data-testid="fallback"]'),
  useParamsId: document.querySelector('[data-testid="useparams-id"]')?.textContent ?? null,
  locationPath: document.querySelector('[data-testid="location-path"]')?.textContent ?? null,
  bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 300),
}));
console.log(JSON.stringify({ url, ...out, errors: errs.slice(0, 6) }, null, 2));
await browser.close();

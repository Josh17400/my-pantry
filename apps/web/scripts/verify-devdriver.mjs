/**
 * M1-L verification: route screenshots + cook-loop E2E against a running preview.
 *
 *   npx vite preview --port 4350 --strictPort --host 127.0.0.1
 *   node scripts/verify-devdriver.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const outDir = path.join(repoRoot, 'reports/screens');
const base = process.env.BASE_URL ?? 'http://127.0.0.1:4350';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES = [
  ['home', '/'],
  ['pantry', '/pantry'],
  ['locations', '/locations'],
  ['recipes', '/recipes'],
  ['recipe-new', '/recipes/new'],
  ['grocery', '/grocery'],
  ['quick', '/quick'],
  ['db-health', '/db-health'],
];

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
let failures = 0;

// Fresh IDB each run
{
  const page = await ctx.newPage();
  await page.goto(`${base}/?reset`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2000);
  const bootText = await page.evaluate(() => document.body.innerText);
  console.log('BOOT textLen=', bootText.trim().length);
  console.log('BOOT snippet:', bootText.replace(/\s+/g, ' ').slice(0, 220));
  await page.close();
}

for (const [name, route] of ROUTES) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 200));
  });
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${String(e).slice(0, 200)}`));

  let status = '?';
  try {
    const r = await page.goto(`${base}${route}`, {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    });
    status = r?.status() ?? '?';
    await sleep(1500);
    await page.screenshot({
      path: path.join(outDir, `${name}.png`),
      fullPage: true,
      timeout: 15000,
    });
  } catch (e) {
    errors.push(`NAV/SHOT ${String(e).slice(0, 160)}`);
  }

  const text = await page
    .evaluate(() => document.body.innerText)
    .catch(() => '');
  const textLen = text.trim().length;
  // db-health intentionally says "not applicable" / "not configured" on web
  const unavailable =
    route !== '/db-health' &&
    /unavailable|not connected|Data layer not ready/i.test(text) &&
    !/Pantry\s+Locations/i.test(text);
  const bad = errors.length > 0 || textLen < 20 || unavailable;
  if (bad) failures++;
  console.log(
    `${bad ? 'FAIL' : ' ok '}  ${route.padEnd(16)} status=${status} textLen=${textLen}` +
      (unavailable ? ' UNAVAILABLE' : ''),
  );
  if (errors.length) console.log(`        ${errors.slice(0, 3).join('\n        ')}`);
  if (['pantry', 'recipes', 'grocery', 'home'].includes(name)) {
    console.log(`        snippet: ${text.replace(/\s+/g, ' ').slice(0, 200)}`);
  }
  await page.close();
}

// ── Cook loop ───────────────────────────────────────────────────────────────
console.log('\n--- COOK LOOP ---');
const cook = await ctx.newPage();

await cook.goto(`${base}/pantry`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await sleep(1500);
// Virtual list — type into search to surface spaghetti
const search = cook.locator('input[type="search"], input[placeholder*="Search" i]');
if ((await search.count()) > 0) {
  await search.first().fill('spaghetti');
  await sleep(800);
}
const pantryBefore = await cook.evaluate(() => document.body.innerText);
console.log(
  'pantry before (search spaghetti):',
  pantryBefore.replace(/\s+/g, ' ').slice(0, 350),
);
const qtyBeforeMatch = pantryBefore.match(/0\.\d+\s*lb|[\d.]+\s*(oz|g|lb)/i);
console.log('qty hint before:', qtyBeforeMatch?.[0]);

await cook.goto(`${base}/recipes`, { waitUntil: 'domcontentloaded', timeout: 20000 });
await sleep(1500);
console.log(
  'recipes snippet:',
  (await cook.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 250),
);

const garlic = cook.locator('a', { hasText: /Garlic Butter Pasta/i });
if ((await garlic.count()) > 0) {
  await garlic.first().click();
} else {
  await cook.locator('a[href*="/recipes/fixture"]').first().click();
}
await sleep(1500);
console.log('detail url:', cook.url());
console.log(
  'detail snippet:',
  (await cook.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300),
);

// Sticky tab bar intercepts the in-page Cook button — navigate directly.
const cookUrl = cook.url().replace(/\/?$/, '') + '/cook?servings=4';
console.log('navigating to cook:', cookUrl);
await cook.goto(cookUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
// Wait until Confirm cook is present (machine left idle)
for (let i = 0; i < 20; i++) {
  const hasConfirm = await cook.evaluate(
    () => !!document.querySelector('[data-testid="cook-confirm"]'),
  );
  if (hasConfirm) break;
  await sleep(250);
}
console.log('cook url:', cook.url());
const previewText = await cook.evaluate(() => document.body.innerText);
console.log('preview snippet:', previewText.replace(/\s+/g, ' ').slice(0, 500));
console.log(
  'has need/have language:',
  /need|have|short|enough|missing/i.test(previewText),
);

const buttons = await cook.evaluate(() =>
  Array.from(document.querySelectorAll('button'))
    .map((b) => b.textContent?.trim())
    .filter(Boolean),
);
console.log('all buttons:', buttons);

const clicked = await cook.evaluate(() => {
  const btn = document.querySelector('[data-testid="cook-confirm"]');
  if (!btn) return false;
  btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  return true;
});
console.log('dispatched confirm click:', clicked);
await sleep(3000);
console.log('after confirm url:', cook.url());
console.log(
  'after confirm:',
  (await cook.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 400),
);

await cook.goto(`${base}/pantry`, { waitUntil: 'domcontentloaded' });
await sleep(1500);
const searchAfter = cook.locator('input[type="search"], input[placeholder*="Search" i]');
if ((await searchAfter.count()) > 0) {
  await searchAfter.first().fill('spaghetti');
  await sleep(800);
}
const pantryAfter = await cook.evaluate(() => document.body.innerText);
console.log(
  'pantry after (search spaghetti):',
  pantryAfter.replace(/\s+/g, ' ').slice(0, 350),
);
const qtyAfterMatch = pantryAfter.match(/0\.\d+\s*lb|[\d.]+\s*(oz|g|lb)/i);
console.log('qty hint after:', qtyAfterMatch?.[0]);
// Also read live qty from zustand if available
const liveQty = await cook.evaluate(() => {
  // Domain is module-scoped; parse visible row
  const t = document.body.innerText;
  const m = t.match(/Spaghetti[\s\S]{0,80}?([\d.]+)\s*(lb|oz|g)/i);
  return m ? `${m[1]} ${m[2]}` : null;
});
console.log('parsed spaghetti qty after cook:', liveQty);

await cook.screenshot({
  path: path.join(outDir, 'cook-e2e-pantry.png'),
  fullPage: true,
  timeout: 15000,
});

await cook.close();
await browser.close();
console.log(`\nroute failures=${failures}`);
process.exit(failures ? 1 : 0);

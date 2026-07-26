import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const outDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../reports/screens',
);
fs.mkdirSync(outDir, { recursive: true });
const base = 'http://127.0.0.1:4350';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('console', (m) => console.log('C', m.type(), m.text().slice(0, 160)));
page.on('pageerror', (e) => console.log('E', String(e).slice(0, 300)));
page.on('crash', () => console.log('CRASH'));

console.log('1 goto');
await page.goto(base + '/', { waitUntil: 'commit', timeout: 15000 });
console.log('2 wait load');
await page.waitForLoadState('load', { timeout: 15000 });
console.log('3 sleep');
await new Promise((r) => setTimeout(r, 2000));
console.log('4 screenshot');
await page.screenshot({
  path: path.join(outDir, 'home.png'),
  fullPage: false,
  timeout: 10000,
});
console.log('5 text via content');
const html = await page.content();
console.log('html len', html.length);
const m = html.match(/<main[\s\S]{0,2000}/i);
console.log('main?', (m?.[0] ?? '').replace(/\s+/g, ' ').slice(0, 300));

// Try evaluate with timeout race
console.log('6 evaluate race');
const text = await Promise.race([
  page.evaluate(() => (document.body && document.body.innerText) || ''),
  new Promise((_, rej) => setTimeout(() => rej(new Error('eval timeout')), 5000)),
]).catch((e) => `ERR ${e.message}`);
console.log('text result', String(text).replace(/\s+/g, ' ').slice(0, 400));

for (const route of ['/pantry', '/recipes', '/grocery']) {
  console.log('route', route);
  await page.goto(base + route, { waitUntil: 'commit', timeout: 15000 });
  await new Promise((r) => setTimeout(r, 1500));
  const name = route.slice(1) || 'home';
  await page.screenshot({
    path: path.join(outDir, `${name}.png`),
    fullPage: false,
    timeout: 10000,
  });
  const t = await Promise.race([
    page.evaluate(() => (document.body && document.body.innerText) || ''),
    new Promise((_, rej) => setTimeout(() => rej(new Error('eval timeout')), 5000)),
  ]).catch((e) => `ERR ${e.message}`);
  console.log(
    name,
    'unavailable=',
    /unavailable|not connected|Data layer not ready/i.test(String(t)),
    'snippet=',
    String(t).replace(/\s+/g, ' ').slice(0, 220),
  );
}

await browser.close();
console.log('done');

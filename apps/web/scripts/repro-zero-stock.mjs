/**
 * Reproduce: remove an item down to 0, then check
 *   (a) the pantry row's status label
 *   (b) whether it appears on the grocery list
 *
 * Owner reported "Plenty" on a zero-quantity item, and no grocery suggestion.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const repoRoot = path.resolve(webRoot, '../..');
const PORT = 4335;
const base = `http://127.0.0.1:${PORT}`;

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: webRoot, shell: true, stdio: 'ignore',
});

async function up(url, ms = 45000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try { if ((await fetch(url)).ok) return true; } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

const rowInfo = (page, name) =>
  page.evaluate((n) => {
    const rows = Array.from(document.querySelectorAll('a[href^="/pantry/"]'));
    const row = rows.find((r) => (r.textContent || '').includes(n));
    return row ? (row.textContent || '').replace(/\s+/g, ' ').trim() : null;
  }, name);

try {
  if (!(await up(base))) { console.error('dev server failed'); process.exit(1); }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.goto(`${base}/pantry`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // Pick the first row and remember its name.
  const target = await page.evaluate(() => {
    const row = document.querySelector('a[href^="/pantry/"]');
    return row ? { href: row.getAttribute('href'), text: (row.textContent || '').replace(/\s+/g, ' ').trim() } : null;
  });
  if (!target) { console.log('no pantry rows'); process.exit(1); }
  const name = target.text.split(/\s{2,}|\d/)[0].trim();
  console.log(`target row BEFORE: ${target.text}`);

  // Open it, Adjust → Remove → max, apply.
  await page.goto(`${base}${target.href}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /^Adjust$/i }).first().click();
  await page.waitForTimeout(600);

  // Switch direction wheel to Remove, then pick the largest quantity option.
  await page.evaluate(() => {
    const rm = document.querySelector('[data-wheel-option="remove"]');
    rm?.scrollIntoView({ block: 'center' });
    rm?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  const applied = await page.evaluate(() => {
    const opts = Array.from(document.querySelectorAll('[data-wheel-option]'))
      .filter((o) => /^[\d.]+$/.test((o.textContent || '').trim()));
    const last = opts[opts.length - 1];
    if (last) { last.scrollIntoView({ block: 'center' }); last.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    return last ? (last.textContent || '').trim() : null;
  });
  console.log(`selected max removal: ${applied}`);
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Apply adjustment/i }).first().click();
  await page.waitForTimeout(1200);

  const detail = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 220));
  console.log(`\ndetail AFTER: ${detail}`);

  // Back to the pantry list — what does the row say now?
  await page.goto(`${base}/pantry`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  console.log(`\npantry row AFTER: ${await rowInfo(page, name)}`);

  // Does it show under the "Out" filter?
  await page.getByRole('button', { name: /^Out$/i }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  console.log(`under Out filter: ${await rowInfo(page, name)}`);

  // And does the grocery list suggest it?
  await page.goto(`${base}/grocery`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  const grocery = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 500));
  console.log(`\ngrocery list: ${grocery}`);
  console.log(`\n>>> grocery mentions "${name}": ${grocery.toLowerCase().includes(name.toLowerCase())}`);

  await page.screenshot({ path: path.join(repoRoot, 'reports/repro-zero-stock.png'), fullPage: true });
  await browser.close();
} finally {
  server.kill();
}

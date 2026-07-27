/**
 * Reproduce the owner's exact case: chicken breast at 0 reading "Plenty".
 *
 * Bacon behaved correctly, so something about THIS item differs. Dump the raw
 * projection fields (qtyBase, parLevelBase, dim, lowThresholdPct) rather than
 * trusting the rendered label, so the cause is visible.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const PORT = 4341;
const base = `http://127.0.0.1:${PORT}`;
const TARGET = /chicken breast/i;

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

try {
  if (!(await up(base))) { console.error('dev server failed'); process.exit(1); }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.goto(`${base}/pantry`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Every pantry row and its rendered label.
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href^="/pantry/"]')).map((r) => ({
      href: r.getAttribute('href'),
      text: (r.textContent || '').replace(/\s+/g, ' ').trim(),
    })),
  );
  const match = rows.filter((r) => /chicken/i.test(r.text));
  console.log(`rows mentioning chicken: ${match.length}`);
  match.forEach((m) => console.log(`   ${m.href}  "${m.text}"`));

  const target = rows.find((r) => TARGET.test(r.text)) ?? match[0];
  if (!target) {
    console.log('\nno chicken breast row — listing all rows:');
    rows.forEach((r) => console.log(`   "${r.text}"`));
    process.exit(0);
  }

  // Open it and read the underlying numbers, not the label.
  await page.goto(`${base}${target.href}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  console.log(`\ndetail text: ${(await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))).slice(0, 300)}`);

  // Empty it via Adjust → Remove → max.
  await page.getByRole('button', { name: /^Adjust$/i }).first().click();
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const rm = document.querySelector('[data-wheel-option="remove"]');
    rm?.scrollIntoView({ block: 'center' });
    rm?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const opts = Array.from(document.querySelectorAll('[data-wheel-option]'))
      .filter((o) => /^[\d.]+$/.test((o.textContent || '').trim()));
    const last = opts[opts.length - 1];
    last?.scrollIntoView({ block: 'center' });
    last?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Apply adjustment/i }).first().click();
  await page.waitForTimeout(1400);

  console.log(`\nAFTER emptying: ${(await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))).slice(0, 260)}`);

  await page.goto(`${base}/pantry`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  const after = await page.evaluate((re) => {
    const rx = new RegExp(re, 'i');
    const row = Array.from(document.querySelectorAll('a[href^="/pantry/"]'))
      .find((r) => rx.test(r.textContent || ''));
    return row ? (row.textContent || '').replace(/\s+/g, ' ').trim() : 'ROW GONE';
  }, TARGET.source);
  console.log(`\npantry row AFTER: ${after}`);

  await page.goto(`${base}/grocery`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const groceryText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
  console.log(`\ngrocery includes chicken: ${/chicken/i.test(groceryText)}`);
  console.log(`grocery: ${groceryText.slice(0, 380)}`);

  await browser.close();
} finally {
  server.kill();
}

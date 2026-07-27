/**
 * Does SCROLLING the wheel actually change the committed value?
 *
 * Automated checks so far clicked [data-wheel-option] directly. A real user
 * scrolls. If scroll-snap moves the visuals but does not update state, the
 * confirm writes the seeded default — which matches the owner's ledger showing
 * "2 grams" after dialling pounds.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const PORT = 4349;
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

const lastTxn = (page) =>
  page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('good-pantry-dev');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const all = await new Promise((res, rej) => {
      const tx = db.transaction('snapshot', 'readonly');
      const req = tx.objectStore('snapshot').getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    db.close();
    const txns = (all[0]?.pantryTxns ?? []).filter((t) =>
      String(t.ingredientId) === 'chicken-breast',
    );
    const t = txns[txns.length - 1];
    return t ? { kind: t.kind, deltaBase: t.deltaBase, targetBase: t.targetBase, reason: t.reason } : null;
  });

try {
  if (!(await up(base))) { console.error('dev server failed'); process.exit(1); }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.goto(`${base}/pantry/chicken-breast/chicken-breast-bulk`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  console.log(`txn before: ${JSON.stringify(await lastTxn(page))}`);

  await page.getByRole('button', { name: /^Adjust$/i }).first().click();
  await page.waitForTimeout(800);

  // Identify the wheel columns and scroll them like a finger would.
  const cols = await page.evaluate(() => {
    const listboxes = Array.from(document.querySelectorAll('[role="listbox"]'));
    return listboxes.map((l, i) => ({
      i,
      options: Array.from(l.querySelectorAll('[role="option"]')).map((o) => (o.textContent || '').trim()),
    }));
  });
  console.log('wheel columns:');
  cols.forEach((c) => console.log(`  [${c.i}] ${c.options.slice(0, 8).join(' | ')}${c.options.length > 8 ? ' …' : ''}`));

  // Scroll the UNIT column to 'lb' and the quantity column a few steps, by
  // scrollTop — the same thing a swipe produces.
  const scrolled = await page.evaluate(() => {
    const listboxes = Array.from(document.querySelectorAll('[role="listbox"]'));
    const report = [];
    for (const lb of listboxes) {
      const opts = Array.from(lb.querySelectorAll('[role="option"]'));
      const target = opts.find((o) => (o.textContent || '').trim() === 'lb')
        ?? opts.find((o) => (o.textContent || '').trim() === '2');
      if (!target) continue;
      const top = target.offsetTop - lb.clientHeight / 2 + target.clientHeight / 2;
      lb.scrollTo({ top, behavior: 'instant' });
      lb.dispatchEvent(new Event('scroll', { bubbles: true }));
      report.push({ to: (target.textContent || '').trim(), scrollTop: lb.scrollTop });
    }
    return report;
  });
  console.log(`scrolled: ${JSON.stringify(scrolled)}`);
  await page.waitForTimeout(900);

  const preview = await page.evaluate(() => {
    const el = document.querySelector('[data-sheet="true"]');
    return (el?.textContent || '').replace(/\s+/g, ' ').slice(0, 240);
  });
  console.log(`\nsheet after scroll: ${preview}`);

  await page.getByRole('button', { name: /Apply adjustment/i }).first().click();
  await page.waitForTimeout(1500);

  const after = await lastTxn(page);
  console.log(`\ntxn AFTER: ${JSON.stringify(after)}`);
  const delta = Math.abs(after?.deltaBase ?? 0);
  console.log(`\n>>> committed ${delta} base units (grams).`);
  console.log(delta > 100 ? '    consistent with a pound-scale amount' : '    TINY — the unit wheel was ignored');

  await browser.close();
} finally {
  server.kill();
}

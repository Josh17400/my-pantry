/**
 * Does the projection repair actually RUN in a browser, or only in unit tests?
 *
 * Recreates the owner's state exactly:
 *   1. empty an item through the UI (ledger txn + correct projection)
 *   2. corrupt the cached qtyBase back to its old value, leaving the ledger at 0
 *      (what the earlier build did)
 *   3. clear the repair stamp so startup is entitled to run
 *   4. reload and see whether the app heals itself
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const PORT = 4345;
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

const readSnapshot = (page) =>
  page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('good-pantry-dev');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const val = await new Promise((res, rej) => {
      const tx = db.transaction('snapshot', 'readonly');
      const req = tx.objectStore('snapshot').getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return val;
  });

const writeSnapshot = (page, mutate) =>
  page.evaluate(async (mutateSrc) => {
    const fn = new Function('snap', mutateSrc);
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
    const keys = await new Promise((res, rej) => {
      const tx = db.transaction('snapshot', 'readonly');
      const req = tx.objectStore('snapshot').getAllKeys();
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    const report = [];
    for (let i = 0; i < all.length; i++) {
      const changed = fn(all[i]);
      if (changed) report.push(String(keys[i]));
      await new Promise((res, rej) => {
        const tx = db.transaction('snapshot', 'readwrite');
        const req = tx.objectStore('snapshot').put(all[i], keys[i]);
        req.onsuccess = () => res();
        req.onerror = () => rej(req.error);
      });
    }
    db.close();
    return report;
  }, mutate);

const chickenRow = (page) =>
  page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('a[href^="/pantry/"]'))
      .find((r) => /chicken/i.test(r.textContent || ''));
    return row ? (row.textContent || '').replace(/\s+/g, ' ').trim() : 'no chicken row';
  });

try {
  if (!(await up(base))) { console.error('dev server failed'); process.exit(1); }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.goto(`${base}/pantry`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  console.log(`1. initial:  ${await chickenRow(page)}`);

  // Empty it through the UI.
  await page.goto(`${base}/pantry/chicken-breast/chicken-breast-bulk`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: /^Adjust$/i }).first().click();
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    document.querySelector('[data-wheel-option="remove"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const opts = Array.from(document.querySelectorAll('[data-wheel-option]'))
      .filter((o) => /^[\d.]+$/.test((o.textContent || '').trim()));
    opts[opts.length - 1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Apply adjustment/i }).first().click();
  await page.waitForTimeout(1500);

  await page.goto(`${base}/pantry`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  console.log(`2. emptied:  ${await chickenRow(page)}`);

  // Corrupt: put the old quantity back on the projection, and drop the stamp.
  // meta is an ARRAY of {key,value} — treating it as an object silently no-ops,
  // which is what made the first run of this script report a false failure.
  const touched = await writeSnapshot(page, `
    let changed = false;
    for (const it of (snap?.pantryItems ?? [])) {
      if (it.ingredientId === 'chicken-breast') {
        it.qtyBase = 900;           // stale "plenty" value; ledger folds to 0
        changed = true;
      }
    }
    if (Array.isArray(snap?.meta)) {
      const before = snap.meta.length;
      snap.meta = snap.meta.filter((m) => !/repair/i.test(m?.key ?? ''));
      if (snap.meta.length !== before) changed = true;
    }
    return changed;
  `);
  console.log(`3. corrupted snapshot records: ${JSON.stringify(touched)}`);

  // Reload — startup repair should notice and heal.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const healed = await chickenRow(page);
  console.log(`4. after reload: ${healed}`);

  const ok = /0 lb|Out/i.test(healed) && !/Plenty/i.test(healed);
  console.log(`\n>>> SELF-HEAL ${ok ? 'WORKS' : 'DID NOT RUN — row still stale'}`);

  await browser.close();
} finally {
  server.kill();
}

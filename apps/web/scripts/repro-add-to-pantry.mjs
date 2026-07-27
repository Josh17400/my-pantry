/**
 * "Added 0 items to the pantry" — which field is missing on the checked rows?
 *
 * The commit loop skips any item lacking ingredientId / formId / qtyBase, and
 * does so silently. Dump the actual rows so the missing field is visible.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const PORT = 4351;
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

try {
  if (!(await up(base))) { console.error('dev server failed'); process.exit(1); }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.goto(`${base}/grocery`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // What is on the list, straight from storage?
  const rows = await page.evaluate(async () => {
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
    return (all[0]?.groceryItems ?? []).map((i) => ({
      name: i.name,
      ingredientId: i.ingredientId ?? null,
      formId: i.formId ?? null,
      qtyBase: i.qtyBase ?? null,
      sources: i.sources,
      checked: i.checked,
    }));
  });

  console.log(`stored grocery rows: ${rows.length}`);
  rows.slice(0, 8).forEach((r) =>
    console.log(
      `  ${String(r.name).padEnd(22)} ing=${r.ingredientId ?? 'NULL'}  form=${r.formId ?? 'NULL'}  qty=${r.qtyBase ?? 'NULL'}  src=${JSON.stringify(r.sources)}`,
    ),
  );

  const missingForm = rows.filter((r) => !r.formId).length;
  const missingIng = rows.filter((r) => !r.ingredientId).length;
  const zeroQty = rows.filter((r) => r.qtyBase === 0 || r.qtyBase === null).length;
  console.log(`\nrows missing formId: ${missingForm}`);
  console.log(`rows missing ingredientId: ${missingIng}`);
  console.log(`rows with qty 0/null: ${zeroQty}`);
  console.log(
    `\n>>> commit loop would skip ${rows.filter((r) => !r.ingredientId || !r.formId || r.qtyBase == null).length} of ${rows.length} rows`,
  );

  await browser.close();
} finally {
  server.kill();
}

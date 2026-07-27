/** Dump the dev snapshot's meta + the chicken projection, to see what gates the repair. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const PORT = 4347;
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
  await page.goto(`${base}/pantry`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);

  const info = await page.evaluate(async () => {
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
    const snap = all[0] ?? {};
    const topKeys = Object.keys(snap);
    const meta = snap.meta ?? snap.appMeta ?? null;
    const items = snap.pantryItems ?? [];
    const chicken = items.filter((i) => String(i.ingredientId).includes('chicken'));
    const txns = (snap.pantryTxns ?? []).filter((t) =>
      String(t.ingredientId).includes('chicken'),
    );
    return {
      topKeys,
      metaType: Array.isArray(meta) ? 'array' : typeof meta,
      metaKeys: Array.isArray(meta)
        ? meta.map((m) => m.key)
        : meta
          ? Object.keys(meta)
          : [],
      chicken: chicken.map((c) => ({ id: c.ingredientId, qtyBase: c.qtyBase, dim: c.dim })),
      txnCount: txns.length,
      txnSum: txns.reduce((a, t) => a + (t.deltaBase ?? 0), 0),
      txnKinds: txns.map((t) => t.kind ?? '?'),
    };
  });

  console.log('snapshot top-level keys:', info.topKeys.join(', '));
  console.log(`meta stored as: ${info.metaType}`);
  console.log('meta keys:');
  info.metaKeys.forEach((k) => console.log(`   ${k}`));
  console.log('\nchicken projection:', JSON.stringify(info.chicken));
  console.log(`chicken txns: ${info.txnCount}  sum(deltaBase)=${info.txnSum}  kinds=${info.txnKinds.join(',')}`);

  await browser.close();
} finally {
  server.kill();
}

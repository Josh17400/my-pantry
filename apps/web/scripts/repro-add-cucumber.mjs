/**
 * Add a cucumber by hand and see what the pantry actually renders.
 *
 * Owner reports the row showing "French" instead of "Cucumber", and a
 * location-filtered view showing "one each" with no name at all.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const PORT = 4353;
const base = `http://127.0.0.1:${PORT}`;

const server = spawn('npx', ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  cwd: webRoot, shell: true, stdio: 'ignore',
});

async function up(url, ms = 60000) {
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
  page.on('console', (m) => { if (m.type() === 'error') console.log(`  [console] ${m.text()}`); });

  await page.goto(`${base}/pantry`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);

  // Is cucumber in the local catalogue table at all?
  const catalog = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('good-pantry-dev');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const all = await new Promise((res, rej) => {
      const tx = db.transaction('snapshot', 'readonly');
      const req = tx.objectStore('snapshot').getAll();
      req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
    });
    db.close();
    const snap = all[0] ?? {};
    const ings = snap.ingredients ?? [];
    return {
      seedVersion: (snap.meta ?? []).find?.((m) => m.key === 'seed_version')?.value ?? '(unknown)',
      count: ings.length,
      cucumber: ings.find((i) => i.id === 'cucumber') ?? null,
      fries: ings.find((i) => i.id === 'frozen-fries') ?? null,
    };
  });
  console.log(`catalogue: ${catalog.count} ingredients, seed_version=${catalog.seedVersion}`);
  console.log(`  cucumber row: ${JSON.stringify(catalog.cucumber)}`);
  console.log(`  frozen-fries row: ${JSON.stringify(catalog.fries)}`);

  // Open Add item.
  await page.getByRole('button', { name: /add/i }).first().click();
  await page.waitForTimeout(700);

  // Type into the real search field.
  await page.fill('#catalog-search', 'cucumber');
  await page.waitForTimeout(700);

  const results = await page.$$eval('#catalog-search ~ ul button, ul button', (btns) =>
    btns.map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 8));
  console.log('\nfiltered results for "cucumber":');
  results.forEach((r) => console.log(`   "${r}"`));

  await page.getByRole('button', { name: /^Cucumber/ }).first().click();
  await page.waitForTimeout(700);

  const forms = await page.$$eval('#add-form option', (o) => o.map((x) => `${x.value}:${x.textContent}`));
  console.log(`\nforms offered: ${JSON.stringify(forms)}`);

  // Choose a location explicitly (blank blocks submit).
  const locs = await page.$$eval('#add-loc option', (o) => o.map((x) => `${x.value}|${x.textContent}`));
  console.log(`locations: ${JSON.stringify(locs)}`);
  const fridge = locs.find((l) => /fridge/i.test(l));
  if (fridge) await page.selectOption('#add-loc', fridge.split('|')[0]);

  // Dial the quantity wheel off its zero default.
  const wheel = page.locator('[data-testid="picker-wheel-quantity"]');
  const opts = await wheel.locator('button, [role="option"]').allTextContents();
  console.log(`quantity wheel options: ${JSON.stringify(opts.slice(0, 8))}`);
  const one = wheel.locator('button, [role="option"]').filter({ hasText: /^\s*1\s*$/ }).first();
  if (await one.count()) await one.click({ force: true });
  else await wheel.locator('button, [role="option"]').nth(1).click({ force: true });
  await page.waitForTimeout(500);
  console.log(`preview: ${await page.locator('[data-testid="picker-preview"]').first().textContent()}`);

  await page.getByRole('button', { name: /add to pantry/i }).click();
  await page.waitForTimeout(2000);

  const alert = await page.$$eval('[role="alert"]', (n) => n.map((x) => x.textContent));
  if (alert.length) console.log(`\n!! submit error: ${JSON.stringify(alert)}`);

  await page.goto(`${base}/pantry`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href^="/pantry/"]'))
      .map((r) => ({ href: r.getAttribute('href'), text: (r.textContent || '').replace(/\s+/g, ' ').trim() })));
  console.log(`\npantry rows (${rows.length}):`);
  rows.forEach((r) => console.log(`   ${r.href}  "${r.text}"`));

  const stored = await page.evaluate(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('good-pantry-dev');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    const all = await new Promise((res, rej) => {
      const tx = db.transaction('snapshot', 'readonly');
      const req = tx.objectStore('snapshot').getAll();
      req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
    });
    db.close();
    return (all[0]?.pantryItems ?? [])
      .filter((i) => /cucumber|fries/.test(i.ingredientId))
      .map((i) => ({
        ingredientId: i.ingredientId,
        formId: i.formId,
        qtyBase: i.qtyBase,
        dim: i.dim,
        locationId: i.locationId,
        ingredientName: i.ingredientName ?? null,
      }));
  });
  console.log(`\nmatching stored rows: ${JSON.stringify(stored, null, 2)}`);

  // Hard gate: one cucumber at qtyBase 1 each, rendered with a real title.
  const cucumber = stored.find((i) => i.ingredientId === 'cucumber');
  const cucumberRow = rows.find((r) => r.href && r.href.includes('/cucumber/'));
  let failed = false;
  if (alert.length) {
    console.error('FAIL: submit still surfaces an alert');
    failed = true;
  }
  if (!cucumber || cucumber.qtyBase !== 1 || cucumber.dim !== 'count') {
    console.error('FAIL: expected cucumber stored as qtyBase=1 dim=count');
    failed = true;
  }
  if (!cucumberRow || !/Cucumber/i.test(cucumberRow.text) || !/1 each/i.test(cucumberRow.text)) {
    console.error('FAIL: expected rendered row "Cucumber … 1 each"');
    failed = true;
  }
  if (cucumber && cucumber.ingredientName && !/cucumber/i.test(cucumber.ingredientName)) {
    console.error('FAIL: denormalized ingredientName is not Cucumber');
    failed = true;
  }

  await browser.close();
  if (failed) process.exit(1);
  console.log('\nOK: cucumber stored at qtyBase 1 count and rendered as Cucumber 1 each');
} finally {
  server.kill();
}

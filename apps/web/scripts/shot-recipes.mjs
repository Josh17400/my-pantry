/** What does the Recipes tab actually show? 50 catalogue recipes are seeded. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const repoRoot = path.resolve(webRoot, '../..');
const PORT = 4333;
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
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${String(e).slice(0, 160)}`));

  await page.goto(`${base}/recipes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(repoRoot, 'reports/recipes-tab.png'), fullPage: true });

  const info = await page.evaluate(() => ({
    cards: document.querySelectorAll('a[href^="/recipes/"]').length,
    text: document.body.innerText.slice(0, 500),
  }));
  console.log(`recipe links on /recipes: ${info.cards}`);
  console.log('--- visible text ---');
  console.log(info.text);
  if (errors.length) {
    console.log('\n--- console errors ---');
    errors.slice(0, 5).forEach((e) => console.log('  ' + e));
  }

  // How many recipes does the store actually hold?
  const count = await page.evaluate(async () => {
    const w = window;
    return w.__recipeCount ?? 'unknown';
  });
  console.log(`\nstore recipe count: ${count}`);

  await browser.close();
} finally {
  server.kill();
}

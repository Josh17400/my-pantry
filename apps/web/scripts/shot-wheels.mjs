/** Screenshot the Adjust (3 wheels) and Recount (2 wheels) sheets for review. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const repoRoot = path.resolve(webRoot, '../..');
const PORT = 4331;
const base = `http://127.0.0.1:${PORT}`;

// DEV server so demo fixtures load — a production build starts empty.
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
  await page.waitForTimeout(900);

  // Open the first pantry row, then each sheet in turn.
  const row = page.locator('a[href^="/pantry/"]').first();
  await row.click();
  await page.waitForTimeout(700);

  for (const [label, name] of [['Adjust', 'adjust'], ['Recount', 'recount']]) {
    const btn = page.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).first();
    if (!(await btn.count())) { console.log(`${label}: trigger not found`); continue; }
    await btn.click();
    await page.waitForTimeout(700);
    const wheels = await page.evaluate(() =>
      document.querySelector('[data-wheel-count]')?.getAttribute('data-wheel-count') ?? '?');
    await page.screenshot({ path: path.join(repoRoot, `reports/wheels-${name}.png`) });
    console.log(`${label}: wheels=${wheels} -> reports/wheels-${name}.png`);
    // Close the sheet before opening the next.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  await browser.close();
} finally {
  server.kill();
}

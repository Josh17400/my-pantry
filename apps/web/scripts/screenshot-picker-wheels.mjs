/**
 * Capture Adjust (3 wheels) and Recount (2 wheels) at 390px for the feature report.
 *   node scripts/screenshot-picker-wheels.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const outDir = path.resolve(webRoot, '../../reports/screens');
const PORT = 4334;
const base = `http://127.0.0.1:${PORT}`;

fs.mkdirSync(outDir, { recursive: true });

const dev = spawn(
  'npx',
  ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { cwd: webRoot, shell: true, stdio: 'ignore' },
);

async function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

try {
  if (!(await waitForServer(base))) {
    console.error('dev server failed to start');
    process.exit(1);
  }

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();

  await page.goto(`${base}/pantry`, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(900);

  const row = page.locator('[data-testid="pantry-item-row"]').first();
  await row.click();
  await page.waitForTimeout(600);

  // Adjust — 3 wheels
  await page.getByRole('button', { name: 'Adjust' }).click();
  await page.waitForTimeout(500);
  await page.waitForSelector('[data-testid="quantity-picker-wheels"][data-wheel-count="3"]');
  // Nudge quantity off zero so preview is interesting if possible
  const qtyWheel = page.locator('[data-testid="picker-wheel-quantity"]');
  const box = await qtyWheel.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(300);
  }
  await page.screenshot({
    path: path.join(outDir, 'picker-adjust-390.png'),
    fullPage: false,
  });
  console.log('wrote reports/screens/picker-adjust-390.png');

  await page.locator('[data-testid="sheet-footer"] button:has-text("Cancel")').click();
  await page.waitForTimeout(300);

  // Recount — 2 wheels
  await page.getByRole('button', { name: 'Recount' }).click();
  await page.waitForTimeout(500);
  await page.waitForSelector('[data-testid="quantity-picker-wheels"][data-wheel-count="2"]');
  await page.screenshot({
    path: path.join(outDir, 'picker-recount-390.png'),
    fullPage: false,
  });
  console.log('wrote reports/screens/picker-recount-390.png');

  await browser.close();
} finally {
  dev.kill();
}

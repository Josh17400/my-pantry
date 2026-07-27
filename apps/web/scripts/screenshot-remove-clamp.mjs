/**
 * Capture Adjust → Remove at the on-hand cap for the wheel-clamp report.
 *   node scripts/screenshot-remove-clamp.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const outDir = path.resolve(webRoot, '../../reports/screens');
const PORT = 4336;
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

  await page.getByRole('button', { name: 'Adjust' }).click();
  await page.waitForTimeout(500);
  await page.waitForSelector(
    '[data-testid="quantity-picker-wheels"][data-wheel-count="3"]',
  );

  // Scroll direction wheel to Remove (options: Add then Remove)
  const dirWheel = page.locator('[data-testid="picker-wheel-direction"]');
  const dirBox = await dirWheel.boundingBox();
  if (dirBox) {
    await page.mouse.move(dirBox.x + dirBox.width / 2, dirBox.y + dirBox.height / 2);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(400);
  }

  // Wait for clamp chrome: available label + removal attribute
  await page.waitForSelector('[data-removal-clamped="true"]', { timeout: 5000 });
  await page.waitForSelector('[data-testid="picker-available"]', { timeout: 5000 });

  // Scroll quantity wheel to the bottom (cap / max on-hand)
  const qtyWheel = page.locator('[data-testid="picker-wheel-quantity"]');
  const qtyBox = await qtyWheel.boundingBox();
  if (qtyBox) {
    // Large wheel delta to reach the last step
    for (let i = 0; i < 8; i++) {
      await page.mouse.move(qtyBox.x + qtyBox.width / 2, qtyBox.y + qtyBox.height / 2);
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(400);
  }

  // Cap hint should surface when selection hits max
  const capHint = page.locator('[data-testid="picker-cap-hint"]');
  const hasHint = (await capHint.count()) > 0 && (await capHint.isVisible());
  console.log('cap hint visible:', hasHint);

  await page.screenshot({
    path: path.join(outDir, 'picker-remove-clamp-390.png'),
    fullPage: false,
  });
  console.log('wrote reports/screens/picker-remove-clamp-390.png');

  // Also write under reports/ root alias expected by some reports
  await page.screenshot({
    path: path.resolve(webRoot, '../../reports/remove-wheel-clamp.png'),
    fullPage: false,
  });
  console.log('wrote reports/remove-wheel-clamp.png');

  await browser.close();
} finally {
  dev.kill();
}

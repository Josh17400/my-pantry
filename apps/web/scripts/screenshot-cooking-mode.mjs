/**
 * Screenshot cooking mode at 390px for M2 Track C review.
 *
 *   node scripts/screenshot-cooking-mode.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const repoRoot = path.resolve(webRoot, '../..');
const PORT = 4332;
const base = `http://localhost:${PORT}`;

const preview = spawn(
  'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: webRoot, shell: true, stdio: 'ignore' },
);

async function waitForServer(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

let exitCode = 0;
try {
  if (!(await waitForServer(base))) {
    console.error('preview server failed to start');
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  // demo=1 uses built-in recipe — works without SQLite/repo
  const cookingUrl = `${base}/recipes/demo-cooking-garlic-pasta/cooking?demo=1&servings=4`;
  const resp = await page.goto(cookingUrl, {
    waitUntil: 'networkidle',
    timeout: 30000,
  });
  console.log('cooking route status:', resp?.status());

  await page.waitForSelector('[data-testid="cooking-mode"]', { timeout: 15000 });
  await page.waitForTimeout(500);

  const ads = await page.getAttribute(
    '[data-testid="cooking-mode"]',
    'data-ads-allowed',
  );
  console.log('data-ads-allowed:', ads);
  if (ads !== 'false') {
    console.error('FAIL: cooking mode must set data-ads-allowed=false');
    exitCode = 1;
  }

  const adSlots = await page.locator('[data-ad-slot]').count();
  console.log('ad slots on page:', adSlots);
  if (adSlots > 0) {
    console.error('FAIL: AdSlot present in cooking mode');
    exitCode = 1;
  }

  const out = path.join(repoRoot, 'reports/cooking-mode.png');
  await page.screenshot({ path: out, fullPage: true });
  console.log('wrote reports/cooking-mode.png');

  // Also smoke barcode route
  const barcodeResp = await page.goto(`${base}/barcode`, {
    waitUntil: 'networkidle',
    timeout: 20000,
  });
  console.log('barcode route status:', barcodeResp?.status());
  await page.waitForSelector('[data-testid="barcode-screen"]', {
    timeout: 10000,
  });
  const attr = await page.locator('[data-testid="off-attribution"]').count();
  console.log('OFF attribution blocks:', attr);
  if (attr < 1) {
    console.error('FAIL: missing OFF attribution on barcode screen');
    exitCode = 1;
  }

  if (errors.length) {
    console.error('page errors:', errors.slice(0, 5));
    exitCode = 1;
  }

  await browser.close();
} catch (err) {
  console.error(err);
  exitCode = 1;
} finally {
  preview.kill();
}

process.exit(exitCode);

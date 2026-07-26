/**
 * Screenshot the Home / Overview screen at 390px for M1 Track H review.
 *
 * Uses demo fixtures (no local SQLite on web). Pattern mirrors screenshot-design.mjs.
 *
 *   node scripts/screenshot-home.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const repoRoot = path.resolve(webRoot, '../..');
const PORT = 4321;
const base = `http://localhost:${PORT}`;

const preview = spawn(
  'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { cwd: webRoot, shell: true, stdio: 'ignore' },
);

async function waitForServer(url, timeoutMs = 30000) {
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
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });

  // demo=1 forces fixture pantry even if a repo is later wired
  const resp = await page.goto(`${base}/?demo=1`, { waitUntil: 'networkidle' });
  console.log('home route status:', resp?.status());

  // Wait for ready phase (demo loads sync, but React paint needs a beat)
  await page.waitForSelector('[data-home-screen][data-phase="ready"]', {
    timeout: 15000,
  });
  await page.waitForTimeout(400);

  await page.screenshot({
    path: path.join(repoRoot, 'reports/home-screen.png'),
    fullPage: true,
  });
  console.log('wrote reports/home-screen.png');

  // Empty-state capture for report (optional secondary)
  await page.goto(`${base}/?empty=1`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  // empty=1 disables demo; with no repo phase should be empty
  const phase = await page.getAttribute('[data-home-screen]', 'data-phase');
  console.log('empty path phase:', phase);
  if (phase === 'empty') {
    await page.screenshot({
      path: path.join(repoRoot, 'reports/home-screen-empty.png'),
      fullPage: true,
    });
    console.log('wrote reports/home-screen-empty.png');
  }

  await browser.close();
} catch (err) {
  console.error(err);
  exitCode = 1;
} finally {
  preview.kill();
}
process.exit(exitCode);

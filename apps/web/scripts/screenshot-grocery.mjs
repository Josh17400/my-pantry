/**
 * Screenshot grocery list at 390px → reports/grocery-screen.png
 *
 *   node apps/web/scripts/screenshot-grocery.mjs
 *
 * Uses multipage grocery-preview.html (App.tsx wiring is another track).
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

async function waitForServer(url, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

let exitCode = 0;
try {
  const ready = await waitForServer(`${base}/grocery-preview.html`);
  if (!ready) {
    console.error('preview server failed to start');
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });

  const resp = await page.goto(`${base}/grocery-preview.html`, {
    waitUntil: 'networkidle',
  });
  console.log('grocery-preview status:', resp?.status());

  // Wait for list content (demo mode builds synchronously after mount)
  await page.waitForSelector('text=Grocery list', { timeout: 15000 });
  // Prefer an aisle section or empty state — either is a valid screen
  await page.waitForTimeout(600);

  await page.screenshot({
    path: path.join(repoRoot, 'reports/grocery-screen.png'),
    fullPage: true,
  });
  console.log('wrote reports/grocery-screen.png');

  await browser.close();
} catch (err) {
  console.error(err);
  exitCode = 1;
} finally {
  preview.kill();
}
process.exit(exitCode);

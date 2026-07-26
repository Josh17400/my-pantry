/**
 * Screenshot pantry list + detail at 390px into reports/pantry-screens.png
 *
 *   node scripts/screenshot-pantry.mjs
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
  ['vite', '--port', String(PORT), '--strictPort'],
  { cwd: webRoot, shell: true, stdio: 'ignore' },
);

async function waitForServer(url, timeoutMs = 60000) {
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
  const url = `${base}/pantry-preview.html`;
  if (!(await waitForServer(url))) {
    console.error('vite failed to start for pantry preview');
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 1600 } });
  const resp = await page.goto(url, { waitUntil: 'networkidle' });
  console.log('pantry preview status:', resp?.status());
  await page.waitForTimeout(500);

  await page.screenshot({
    path: path.join(repoRoot, 'reports/pantry-screens.png'),
    fullPage: true,
  });
  console.log('wrote reports/pantry-screens.png');

  await browser.close();
} catch (err) {
  console.error(err);
  exitCode = 1;
} finally {
  preview.kill();
}
process.exit(exitCode);

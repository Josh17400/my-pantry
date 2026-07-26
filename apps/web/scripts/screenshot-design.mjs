/**
 * Screenshot the /design gallery for review, and assert the wordmark lockup
 * survives a narrow (320px) header.
 *
 * A three-word product name is the kind of thing that looks fine at 390px and
 * blows out the header on a small phone, so this checks for real horizontal
 * overflow rather than trusting the screenshot to look right.
 *
 *   node scripts/screenshot-design.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const repoRoot = path.resolve(webRoot, '../..');
const PORT = 4319;
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

  const resp = await page.goto(`${base}/design`, { waitUntil: 'networkidle' });
  console.log('design route status:', resp?.status());

  await page.screenshot({
    path: path.join(repoRoot, 'reports/design-gallery.png'),
    fullPage: true,
  });

  await page.setViewportSize({ width: 320, height: 560 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(repoRoot, 'reports/wordmark-320.png') });

  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  const overflows = scrollW > clientW;
  console.log(
    `at 320px: scrollWidth=${scrollW} clientWidth=${clientW} -> ${overflows ? 'OVERFLOWS' : 'fits'}`,
  );
  if (overflows) exitCode = 2;

  await browser.close();
} finally {
  preview.kill();
}
process.exit(exitCode);

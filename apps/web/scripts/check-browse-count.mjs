/** Does Browse actually list the 50 catalogue recipes? Count, not "text rendered". */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const repoRoot = path.resolve(webRoot, '../..');
const PORT = 4338;
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
  await page.goto(`${base}/recipes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const countCards = () =>
    page.evaluate(() => document.querySelectorAll('a[href^="/recipes/"]').length);

  // SegmentedControl renders role="tab" inside role="tablist".
  const tabs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="tab"]')).map((t) =>
      (t.textContent || '').trim(),
    ),
  );
  console.log(`tabs found: ${JSON.stringify(tabs)}`);
  console.log(`default view: ${await countCards()} cards`);

  for (const label of tabs) {
    await page.evaluate((l) => {
      const t = Array.from(document.querySelectorAll('[role="tab"]')).find(
        (x) => (x.textContent || '').trim() === l,
      );
      t?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }, label);
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    console.log(`  ${label}: ${await countCards()} cards`);
    if (/browse/i.test(label)) {
      await page.screenshot({
        path: path.join(repoRoot, 'reports/recipes-browse.png'),
        fullPage: true,
      });
    }
    await page.evaluate(() => window.scrollTo(0, 0));
  }

  await browser.close();
} finally {
  server.kill();
}

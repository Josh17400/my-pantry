/**
 * Reproduce the owner's exact path: Home → At a Glance "Fridge" → filtered pantry.
 * The unfiltered pantry renders names correctly, so the defect is in the
 * location-filtered view.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const repoRoot = path.resolve(webRoot, '../..');
const PORT = 4326;
const base = `http://localhost:${PORT}`;

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: webRoot, shell: true, stdio: 'ignore',
});

async function up(url, ms = 30000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    try { if ((await fetch(url)).ok) return true; } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

try {
  if (!(await up(base))) { console.error('preview failed'); process.exit(1); }
  const browser = await chromium.launch();
  // iPhone-ish viewport so safe-area behaviour is representative.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  for (const [name, url] of [
    ['fridge', `${base}/pantry?location=loc-fridge&demo=1`],
    ['pantry', `${base}/pantry?location=loc-pantry&demo=1`],
  ]) {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(repoRoot, `reports/filtered-${name}.png`), fullPage: true });

    // What text is actually in the list rows?
    const titles = await page.evaluate(() =>
      Array.from(document.querySelectorAll('a,li,[data-testid]'))
        .map((el) => (el.textContent || '').trim().split('\n')[0])
        .filter((t) => t && t.length < 60)
        .slice(0, 14),
    );
    console.log(`\n${url.replace(base, '')}`);
    titles.forEach((t) => console.log(`   "${t}"`));
  }
  await browser.close();
} finally {
  preview.kill();
}

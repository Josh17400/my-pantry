/**
 * Walk every product route, screenshot it, and fail on console errors.
 *
 * Typecheck proves the router compiles; it does not prove the screens render.
 * This catches runtime breakage (bad hook usage, missing data, crashed
 * suspense boundaries) that a green build happily hides.
 *
 *   node scripts/screenshot-routes.mjs
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const repoRoot = path.resolve(webRoot, '../..');
const outDir = path.join(repoRoot, 'reports/screens');
const PORT = 4320;
const base = `http://localhost:${PORT}`;

const ROUTES = [
  ['home', '/'],
  ['pantry', '/pantry'],
  ['locations', '/locations'],
  ['recipes', '/recipes'],
  ['recipe-new', '/recipes/new'],
  ['grocery', '/grocery'],
  ['quick', '/quick'],
  ['db-health', '/db-health'],
];

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: webRoot,
  shell: true,
  stdio: 'ignore',
});

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

let failures = 0;
try {
  if (!(await waitForServer(base))) {
    console.error('preview server failed to start');
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });

  for (const [name, route] of ROUTES) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text().slice(0, 200));
    });
    page.on('pageerror', (e) => errors.push(`PAGEERROR ${String(e).slice(0, 200)}`));

    let status = '?';
    try {
      const r = await page.goto(`${base}${route}`, { waitUntil: 'networkidle', timeout: 20000 });
      status = r?.status() ?? '?';
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true });
    } catch (e) {
      errors.push(`NAV FAILED ${String(e).slice(0, 160)}`);
    }

    // A blank body means the route "loaded" but rendered nothing useful.
    const textLen = await page
      .evaluate(() => document.body.innerText.trim().length)
      .catch(() => 0);

    const bad = errors.length > 0 || textLen < 20;
    if (bad) failures++;
    console.log(
      `${bad ? 'FAIL' : ' ok '}  ${route.padEnd(16)} status=${status} textLen=${textLen}` +
        (errors.length ? `\n        ${errors.slice(0, 3).join('\n        ')}` : ''),
    );
    await page.close();
  }

  await browser.close();
} finally {
  preview.kill();
}

console.log(`\n${failures === 0 ? 'all routes rendered' : `${failures} route(s) with problems`}`);
process.exit(failures === 0 ? 0 : 2);

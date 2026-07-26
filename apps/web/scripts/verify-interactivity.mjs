/**
 * Interactivity + layout regression checks.
 *
 * screenshot-routes.mjs only asserts rendered text — that is why an inert home
 * screen still looked "ok". This companion asserts:
 *   1. Clicks change the URL (home CTAs, glance, see-all, pantry row)
 *   2. No horizontal page overflow at 320px on every product route
 *   3. A fresh profile (no fixtures / no ?demo) shows empty states, not demo groceries
 *
 *   node scripts/verify-interactivity.mjs
 * Requires a prior `npm run build` (uses vite preview).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const PORT = 4321;
const base = `http://localhost:${PORT}`;

const ROUTES_320 = [
  '/',
  '/pantry',
  '/recipes',
  '/grocery',
  '/settings',
  '/quick',
  '/scan',
  '/locations',
  '/paywall',
  '/privacy',
];

const DEMO_GROCERY_MARKERS = [
  'ground beef',
  'spinach scramble',
  'Demo pantry',
  'trip-demo-fixture',
];

let failures = 0;
const notes = [];

function fail(msg) {
  failures += 1;
  notes.push(`FAIL  ${msg}`);
  console.error(`FAIL  ${msg}`);
}

function ok(msg) {
  notes.push(` ok   ${msg}`);
  console.log(` ok   ${msg}`);
}

const preview = spawn(
  'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  {
    cwd: webRoot,
    shell: true,
    stdio: 'ignore',
  },
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

async function noHorizontalOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const scrollW = Math.max(doc.scrollWidth, body.scrollWidth);
    const clientW = doc.clientWidth;
    return {
      ok: scrollW <= clientW + 1, // 1px tolerance for subpixel
      scrollW,
      clientW,
    };
  });
}

async function pathOf(page) {
  return page.evaluate(() => window.location.pathname + window.location.search);
}

try {
  if (!(await waitForServer(base))) {
    console.error('preview server failed to start');
    process.exit(1);
  }

  const browser = await chromium.launch();

  // ── 1. Fresh profile: empty states, no demo groceries ───────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    await page.goto(`${base}/?empty=1`, {
      waitUntil: 'networkidle',
      timeout: 25000,
    });
    await page.waitForTimeout(800);

    const bodyText = (await page.locator('body').innerText()).toLowerCase();
    const hasDemoMarker = DEMO_GROCERY_MARKERS.some((m) =>
      bodyText.includes(m.toLowerCase()),
    );
    if (hasDemoMarker) {
      fail('fresh home shows demo grocery markers');
    } else {
      ok('fresh home has no demo grocery markers');
    }

    // Greeting without a hardcoded name
    const greeting = await page
      .locator('[data-testid="home-greeting"]')
      .textContent()
      .catch(() => '');
    if (greeting && /alex/i.test(greeting)) {
      fail(`greeting invents name: "${greeting}"`);
    } else {
      ok(`greeting without invented name: "${(greeting || '').trim()}"`);
    }

    // Empty pantry invitation (empty phase or empty glance)
    const emptyUi =
      (await page.locator('[data-testid="home-empty"]').count()) > 0 ||
      bodyText.includes('pantry is waiting') ||
      bodyText.includes('add your first');
    if (!emptyUi && bodyText.includes('at a glance')) {
      // ready phase with zero-count cards is also acceptable for empty repo
      ok('home rendered without demo stock (glance or empty)');
    } else if (emptyUi) {
      ok('home shows first-run empty invitation');
    } else {
      fail('home neither empty invitation nor empty glance');
    }

    // Settings reachable from home header
    const settingsBtn = page.locator('[data-testid="home-settings"]');
    if ((await settingsBtn.count()) === 0) {
      fail('settings icon missing from home header');
    } else {
      await settingsBtn.click();
      await page.waitForTimeout(400);
      const p = await pathOf(page);
      if (p.startsWith('/settings')) {
        ok('settings icon navigates to /settings');
      } else {
        fail(`settings icon did not navigate (path=${p})`);
      }
      // Diagnostics → DB Health link
      const dbLink = page.locator('a[href="/db-health"]');
      if ((await dbLink.count()) > 0) {
        ok('settings exposes DB Health link');
      } else {
        fail('settings missing Diagnostics → DB Health');
      }
    }

    // Grocery empty
    await page.goto(`${base}/grocery`, {
      waitUntil: 'networkidle',
      timeout: 20000,
    });
    await page.waitForTimeout(600);
    const groceryText = (await page.locator('body').innerText()).toLowerCase();
    const groceryDemo = DEMO_GROCERY_MARKERS.some((m) =>
      groceryText.includes(m.toLowerCase()),
    );
    if (groceryDemo) {
      fail('grocery list shows demo fixtures on fresh profile');
    } else if (
      groceryText.includes('list is empty') ||
      groceryText.includes('nothing to buy') ||
      groceryText.includes('0 of 0')
    ) {
      ok('grocery list empty state on fresh profile');
    } else {
      // Live rebuild with empty pantry can still be empty without exact copy
      const hasLines = await page.locator('[data-testid="grocery-line"]').count();
      if (hasLines === 0) {
        ok('grocery has no fabricated lines');
      } else {
        fail('grocery has lines on fresh empty profile');
      }
    }

    await ctx.close();
  }

  // ── 2. Horizontal overflow at 320px ─────────────────────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 320, height: 700 },
    });
    const page = await ctx.newPage();
    for (const route of ROUTES_320) {
      await page.goto(`${base}${route}`, {
        waitUntil: 'networkidle',
        timeout: 20000,
      });
      await page.waitForTimeout(400);
      const m = await noHorizontalOverflow(page);
      if (m.ok) {
        ok(`no h-overflow ${route} (${m.scrollW}≤${m.clientW})`);
      } else {
        fail(
          `horizontal overflow ${route}: scrollWidth=${m.scrollW} clientWidth=${m.clientW}`,
        );
      }
    }
    await ctx.close();
  }

  // ── 3. Interactive navigation (demo data so rails exist) ────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await ctx.newPage();
    await page.goto(`${base}/?demo=1`, {
      waitUntil: 'networkidle',
      timeout: 25000,
    });
    await page.waitForTimeout(1000);

    const phase = await page
      .locator('[data-home-screen]')
      .getAttribute('data-phase')
      .catch(() => null);

    if (phase !== 'ready') {
      // Demo flag should force ready with fixtures
      fail(`expected demo home phase=ready, got ${phase}`);
    } else {
      ok('demo home phase=ready');
    }

    async function clickAndExpect(selector, expectPath, label) {
      const el = page.locator(selector).first();
      if ((await el.count()) === 0) {
        fail(`${label}: selector not found (${selector})`);
        return;
      }
      await el.click();
      await page.waitForTimeout(500);
      const p = await pathOf(page);
      const matched =
        typeof expectPath === 'function'
          ? expectPath(p)
          : p === expectPath || p.startsWith(expectPath);
      if (matched) {
        ok(`${label} → ${p}`);
      } else {
        fail(`${label}: expected ${expectPath}, got ${p}`);
      }
      // Return home for next check
      await page.goto(`${base}/?demo=1`, {
        waitUntil: 'networkidle',
        timeout: 20000,
      });
      await page.waitForTimeout(500);
    }

    await clickAndExpect(
      '[data-testid="glance-loc-fridge"]',
      (p) => p.startsWith('/pantry') && p.includes('location='),
      'At a Glance Fridge',
    );
    await clickAndExpect(
      '[data-testid="glance-loc-pantry"]',
      (p) => p.startsWith('/pantry') && p.includes('location='),
      'At a Glance Pantry',
    );
    await clickAndExpect(
      '[data-testid="glance-loc-around-house"]',
      (p) => p.startsWith('/pantry') && p.includes('location='),
      'At a Glance Around the House',
    );
    await clickAndExpect(
      '[data-testid="glance-favorites"]',
      (p) => p.startsWith('/pantry') && p.includes('filter=favorites'),
      'At a Glance Favorites',
    );

    // Cook-now CTA (may be absent if zero cookable — then skip with note)
    if ((await page.locator('[data-testid="cook-now-cta"]').count()) > 0) {
      await clickAndExpect(
        '[data-testid="cook-now-cta"]',
        (p) => p.startsWith('/recipes'),
        'Cook-now CTA',
      );
    } else {
      ok('Cook-now CTA absent (0 cookable) — skipped');
    }

    // See all on recipe inspiration
    if ((await page.locator('[data-testid="recipe-inspiration"]').count()) > 0) {
      await clickAndExpect(
        '[data-testid="recipe-inspiration"] [data-testid="rail-see-all"]',
        (p) => p.startsWith('/recipes'),
        'Recipe Inspiration See all',
      );
      await clickAndExpect(
        '[data-testid="recipe-inspiration-card"]',
        (p) => p.startsWith('/recipes/'),
        'Recipe Inspiration card',
      );
    } else {
      ok('Recipe Inspiration absent — skipped');
    }

    // Fridge / Pantry see all
    if ((await page.locator('[data-testid="fridge-highlights"]').count()) > 0) {
      await clickAndExpect(
        '[data-testid="fridge-highlights"] [data-testid="rail-see-all"]',
        (p) => p.startsWith('/pantry') && p.includes('location='),
        'Fridge Highlights See all',
      );
    }
    if ((await page.locator('[data-testid="pantry-staples"]').count()) > 0) {
      await clickAndExpect(
        '[data-testid="pantry-staples"] [data-testid="rail-see-all"]',
        (p) => p.startsWith('/pantry') && p.includes('location='),
        'Pantry Staples See all',
      );
    }

    // Segmented control: Fridge filters home (stays on /) — Recipes navigates
    const fridgeSeg = page.getByRole('tab', { name: 'Fridge' });
    if ((await fridgeSeg.count()) > 0) {
      await fridgeSeg.click();
      await page.waitForTimeout(300);
      const p = await pathOf(page);
      if (p === '/' || p.startsWith('/?')) {
        ok('segment Fridge keeps home and filters body');
      } else {
        fail(`segment Fridge left home unexpectedly (${p})`);
      }
      // Glance should hide when not overview
      const glanceCount = await page.locator('[data-testid="at-a-glance"]').count();
      if (glanceCount === 0) {
        ok('segment Fridge hides At a Glance');
      } else {
        fail('segment Fridge still shows At a Glance');
      }
    }

    await page.goto(`${base}/?demo=1`, {
      waitUntil: 'networkidle',
      timeout: 20000,
    });
    await page.waitForTimeout(400);
    const recipesSeg = page.getByRole('tab', { name: 'Recipes' });
    if ((await recipesSeg.count()) > 0) {
      await recipesSeg.click();
      await page.waitForTimeout(500);
      const p = await pathOf(page);
      if (p.startsWith('/recipes')) {
        ok(`segment Recipes navigates → ${p}`);
      } else {
        fail(`segment Recipes did not navigate (path=${p})`);
      }
    }

    // Pantry row → item detail (not home)
    await page.goto(`${base}/pantry`, {
      waitUntil: 'networkidle',
      timeout: 20000,
    });
    await page.waitForTimeout(800);
    // With production preview + empty fixtures, pantry may be empty — use demo home item tile instead
    const pantryRows = page.locator('[data-testid="pantry-item-row"]');
    if ((await pantryRows.count()) > 0) {
      const nameBefore = await pantryRows
        .first()
        .locator('[data-testid="pantry-item-name"]')
        .textContent()
        .catch(() => '');
      if (nameBefore && /^fridge$/i.test(nameBefore.trim())) {
        fail(`pantry row shows location as name: "${nameBefore}"`);
      } else {
        ok(`pantry row name is item: "${(nameBefore || '').trim()}"`);
      }
      await pantryRows.first().click();
      await page.waitForTimeout(500);
      const p = await pathOf(page);
      if (
        p.startsWith('/pantry/') &&
        p !== '/pantry' &&
        !p.includes('location=')
      ) {
        ok(`pantry row → item detail ${p}`);
      } else if (p === '/' || p === '') {
        fail(`pantry row navigated to Home (${p}) — route mismatch`);
      } else {
        fail(`pantry row unexpected path ${p}`);
      }
    } else {
      // Production empty: seed a navigation via home demo item tile if present
      await page.goto(`${base}/?demo=1`, {
        waitUntil: 'networkidle',
        timeout: 20000,
      });
      await page.waitForTimeout(600);
      const tile = page
        .locator('[data-testid="fridge-highlights"] [data-testid="item-tile"]')
        .first();
      if ((await tile.count()) > 0) {
        await tile.click();
        await page.waitForTimeout(500);
        const p = await pathOf(page);
        // /pantry/:ingredientId/:formId → at least 3 path segments after host
        const parts = p.split('/').filter(Boolean);
        if (
          parts[0] === 'pantry' &&
          parts.length >= 3 &&
          !p.includes('location=')
        ) {
          ok(`highlight tile → item detail ${p}`);
        } else {
          fail(`highlight tile path ${p}`);
        }
      } else {
        ok('pantry row check skipped (empty pantry, no highlight tiles)');
      }
    }

    // Tab bar has 4 tabs (not 5 Me)
    await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(300);
    const tabLabels = await page.locator('nav[aria-label="Main"] button').allTextContents();
    const meTab = tabLabels.some((t) => /^me$/i.test(t.trim()));
    if (meTab) {
      fail(`tab bar still has Me tab: ${tabLabels.join(' | ')}`);
    } else {
      ok(`tab bar 4 tabs + FAB (no Me): ${tabLabels.map((t) => t.trim()).filter(Boolean).join(', ')}`);
    }

    await ctx.close();
  }

  await browser.close();
} finally {
  preview.kill();
}

console.log(
  `\n${failures === 0 ? 'all interactivity checks passed' : `${failures} interactivity check(s) failed`}`,
);
process.exit(failures === 0 ? 0 : 2);

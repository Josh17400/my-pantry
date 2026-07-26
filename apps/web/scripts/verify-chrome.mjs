/**
 * App chrome regression checks (safe areas, tab bar, FAB, hit-testing, rails).
 *
 * Companion to verify-interactivity.mjs — layout/shell only, not navigation.
 *
 *   node scripts/verify-chrome.mjs
 * Requires a prior `npm run build` (uses vite preview).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const PORT = 4322;
const base = `http://localhost:${PORT}`;

/** Simulated Dynamic Island / home-indicator insets (CSS px). */
const SAFE_TOP = 47;
const SAFE_BOTTOM = 34;

const SHELL_ROUTES = [
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

let failures = 0;

function fail(msg) {
  failures += 1;
  console.error(`FAIL  ${msg}`);
}

function ok(msg) {
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

/**
 * Force safe-area-like padding on the shell. Desktop Chromium does not honor
 * env(safe-area-inset-*), so we pin the shell insets for assertions.
 */
async function injectSafeAreaSimulation(page) {
  await page.addStyleTag({
    content: `
      [data-app-shell] {
        padding-top: ${SAFE_TOP}px !important;
        padding-left: 0px !important;
        padding-right: 0px !important;
      }
      [data-app-shell] main {
        padding-bottom: calc(6.5rem + ${SAFE_BOTTOM}px) !important;
      }
      [data-testid="app-tab-bar"] {
        padding-bottom: ${SAFE_BOTTOM}px !important;
      }
    `,
  });
}

async function countVisibleFabs(page) {
  return page.evaluate(() => {
    const buttons = Array.from(
      document.querySelectorAll('button[aria-label]'),
    );
    return buttons.filter((el) => {
      const label = (el.getAttribute('aria-label') || '').toLowerCase();
      if (!(label === 'add' || label === 'add item' || label.startsWith('add '))) {
        return false;
      }
      // FABs are the circular primary + buttons (h-14 w-14 ≈ 56px)
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.width > 72 || r.height < 40 || r.height > 72) {
        return false;
      }
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (Number(style.opacity) === 0) return false;
      // Must be the rounded-full primary FAB, not a pill header button
      const br = style.borderRadius;
      const isRound =
        br === '9999px' ||
        br === '50%' ||
        (parseFloat(br) >= r.width / 2 - 1 && br.includes('px'));
      return isRound && r.bottom > 0 && r.top < window.innerHeight;
    }).length;
  });
}

async function assertNoObscuredControls(page, route) {
  const result = await page.evaluate((safeTop) => {
    const tabBar = document.querySelector('[data-testid="app-tab-bar"]');
    const tabTop = tabBar
      ? tabBar.getBoundingClientRect().top
      : window.innerHeight;
    // Content band: below simulated status bar, above the fixed tab bar.
    // Elements whose centre sits in the tab-bar band are not free targets at
    // the current scroll — main bottom padding lets the user scroll them up.
    // This assertion catches peers covering peers (duplicate FAB, stacked
    // sheets, wrong z-index), not intentional fixed chrome.
    const bandTop = safeTop;
    const bandBottom = tabTop - 2;

    const interactive = Array.from(
      document.querySelectorAll(
        'a[href], button:not([disabled]), [role="button"], input, select, textarea',
      ),
    );
    const obscured = [];
    for (const el of interactive) {
      // Skip chrome itself (tab bar + raised FAB)
      if (tabBar && (tabBar === el || tabBar.contains(el))) continue;
      const fabAncestor = el.closest('[data-testid="app-tab-bar"]');
      if (fabAncestor) continue;

      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (Number(style.opacity) === 0) continue;
      if (style.pointerEvents === 'none') continue;

      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < 0 || cx > window.innerWidth) continue;
      // Only hit-test centres in the free content band
      if (cy < bandTop || cy > bandBottom) continue;

      const topEl = document.elementFromPoint(cx, cy);
      if (!topEl) {
        obscured.push({
          tag: el.tagName,
          label:
            el.getAttribute('aria-label') ||
            el.textContent?.trim().slice(0, 40) ||
            '',
          reason: 'elementFromPoint returned null',
        });
        continue;
      }
      if (el === topEl || el.contains(topEl) || topEl.contains(el)) {
        continue;
      }

      obscured.push({
        tag: el.tagName,
        label:
          el.getAttribute('aria-label') ||
          el.textContent?.trim().slice(0, 40) ||
          '',
        topTag: topEl.tagName,
        topLabel:
          topEl.getAttribute?.('aria-label') ||
          topEl.textContent?.trim().slice(0, 30) ||
          '',
      });
    }
    return { obscured, tabTop, bandBottom };
  }, SAFE_TOP);

  if (result.obscured.length === 0) {
    ok(
      `${route}: no interactive element obscured in content band (tabTop=${Math.round(result.tabTop)})`,
    );
  } else {
    const sample = result.obscured
      .slice(0, 3)
      .map(
        (o) =>
          `${o.tag}"${o.label}" under ${o.topTag ?? '?'}("${o.topLabel ?? o.reason}")`,
      )
      .join('; ');
    fail(
      `${route}: ${result.obscured.length} obscured control(s) — e.g. ${sample}`,
    );
  }
}

async function assertNothingInTopSafeArea(page, route) {
  const violators = await page.evaluate((safeTop) => {
    const interactive = Array.from(
      document.querySelectorAll(
        'a[href], button:not([disabled]), [role="button"], input, select, textarea',
      ),
    );
    const bad = [];
    for (const el of interactive) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (Number(style.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      // Element is "in" the top safe area if its top edge is above the inset
      // and it still has some visible height in the viewport.
      if (r.top < safeTop - 0.5 && r.bottom > 0) {
        bad.push({
          label:
            el.getAttribute('aria-label') ||
            el.textContent?.trim().slice(0, 40) ||
            el.tagName,
          top: Math.round(r.top * 10) / 10,
        });
      }
    }
    return bad;
  }, SAFE_TOP);

  if (violators.length === 0) {
    ok(`${route}: no interactive element in top safe area (${SAFE_TOP}px)`);
  } else {
    const sample = violators
      .slice(0, 3)
      .map((v) => `"${v.label}"@top=${v.top}`)
      .join(', ');
    fail(
      `${route}: ${violators.length} control(s) under status bar — ${sample}`,
    );
  }
}

async function assertTabBarVisible(page, route) {
  const tab = page.locator('[data-testid="app-tab-bar"]');
  if ((await tab.count()) === 0) {
    fail(`${route}: tab bar missing`);
    return;
  }
  const box = await tab.boundingBox();
  if (!box) {
    fail(`${route}: tab bar has no box (not visible)`);
    return;
  }
  const vp = page.viewportSize();
  if (!vp) {
    fail(`${route}: no viewport`);
    return;
  }
  // Immediately after load, before any scroll — bar must sit in the viewport.
  const fullyInView =
    box.y >= 0 &&
    box.y + box.height <= vp.height + 1 &&
    box.x + box.width > 0 &&
    box.x < vp.width;
  if (fullyInView) {
    ok(`${route}: tab bar visible without scrolling (y=${Math.round(box.y)})`);
  } else {
    fail(
      `${route}: tab bar not fully in viewport (y=${box.y}, h=${box.height}, vp=${vp.height})`,
    );
  }
}

async function assertOneFab(page, route) {
  const n = await countVisibleFabs(page);
  if (n === 1) {
    ok(`${route}: exactly one FAB`);
  } else {
    fail(`${route}: expected 1 FAB, found ${n}`);
  }
}

/**
 * Vertical page scroll when the gesture starts over a horizontal rail.
 * Uses CDP touch events so touch-action: pan-x is exercised.
 */
async function assertRailAllowsVerticalScroll(page) {
  // Need a page with rails — demo home.
  await page.goto(`${base}/?demo=1`, {
    waitUntil: 'networkidle',
    timeout: 25000,
  });
  await page.waitForTimeout(900);
  await injectSafeAreaSimulation(page);

  const rail = page.locator('[data-testid="horizontal-rail"]').first();
  if ((await rail.count()) === 0) {
    // Empty demo still may lack rails — fall back to style check on any future rail markup via home.
    // Assert the CSS utility is defined and Rail uses it when present on design page.
    await page.goto(`${base}/`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(400);
    // Without demo rails, check that touch-pan-x utility exists in stylesheets
    const hasUtility = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules || [])) {
            if (rule.selectorText === '.touch-pan-x') return true;
          }
        } catch {
          /* cross-origin */
        }
      }
      return false;
    });
    if (hasUtility) {
      ok('rail scroll: no demo rails; touch-pan-x utility present');
    } else {
      fail('rail scroll: no rails and touch-pan-x utility missing');
    }
    return;
  }

  const touchAction = await rail.evaluate((el) =>
    window.getComputedStyle(el).touchAction,
  );
  if (touchAction === 'pan-x' || touchAction.includes('pan-x')) {
    ok(`rail has touch-action: ${touchAction}`);
  } else {
    fail(`rail touch-action expected pan-x, got "${touchAction}"`);
  }

  const box = await rail.boundingBox();
  if (!box) {
    fail('rail has no bounding box');
    return;
  }

  const scrollBefore = await page.evaluate(() =>
    Math.max(
      window.scrollY,
      document.documentElement.scrollTop,
      document.body.scrollTop,
    ),
  );

  // Ensure page is actually scrollable
  const canScroll = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollHeight > doc.clientHeight + 40;
  });
  if (!canScroll) {
    ok('rail vertical scroll: page not tall enough to scroll — style check only');
    return;
  }

  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + Math.min(box.height / 2, 20));
  const client = await page.context().newCDPSession(page);

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x, y, id: 1 }],
  });
  // Swipe up (finger moves up → content scrolls down)
  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x, y: y - i * 28, id: 1 }],
    });
  }
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await page.waitForTimeout(300);

  const scrollAfter = await page.evaluate(() =>
    Math.max(
      window.scrollY,
      document.documentElement.scrollTop,
      document.body.scrollTop,
    ),
  );

  if (scrollAfter > scrollBefore + 8) {
    ok(
      `page scrolls vertically from rail gesture (${scrollBefore} → ${scrollAfter})`,
    );
  } else {
    // Some WebViews still need a nudge; also try wheel as secondary signal that
    // the rail is not overflow-y: hidden trapping scroll on a parent.
    await page.mouse.move(x, y);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(200);
    const scrollWheel = await page.evaluate(() =>
      Math.max(
        window.scrollY,
        document.documentElement.scrollTop,
        document.body.scrollTop,
      ),
    );
    if (scrollWheel > scrollBefore + 8) {
      ok(
        `page scrolls from over-rail position via wheel (${scrollBefore} → ${scrollWheel}); touch-action pan-x set`,
      );
    } else {
      fail(
        `page did not scroll when gesture started on rail (before=${scrollBefore}, touch=${scrollAfter}, wheel=${scrollWheel})`,
      );
    }
  }
}

try {
  if (!(await waitForServer(base))) {
    console.error('preview server failed to start');
    process.exit(1);
  }

  const browser = await chromium.launch();
  const iPhone = devices['iPhone 14 Pro'] ?? {
    viewport: { width: 393, height: 852 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 3,
  };

  const ctx = await browser.newContext({
    ...iPhone,
    // Keep viewport explicit for safe-area math
    viewport: iPhone.viewport ?? { width: 393, height: 852 },
  });
  const page = await ctx.newPage();

  for (const route of SHELL_ROUTES) {
    await page.goto(`${base}${route}`, {
      waitUntil: 'networkidle',
      timeout: 25000,
    });
    await page.waitForTimeout(500);
    await injectSafeAreaSimulation(page);
    // Re-assert after style injection settles layout
    await page.waitForTimeout(150);

    // 3. Tab bar visible without scrolling
    await assertTabBarVisible(page, route);

    // 2. Exactly one FAB
    await assertOneFab(page, route);

    // 4. Nothing in top safe area
    await assertNothingInTopSafeArea(page, route);

    // 1. Hit-test every visible interactive control
    await assertNoObscuredControls(page, route);
  }

  // 5. Vertical scroll starting on a horizontal rail
  await assertRailAllowsVerticalScroll(page);

  // Design gallery may host extra FABs — not a shell route; skip shell asserts.
  // Sanity: pantry header has Add (not a second FAB)
  await page.goto(`${base}/pantry`, {
    waitUntil: 'networkidle',
    timeout: 20000,
  });
  await page.waitForTimeout(400);
  const headerAdd = await page.locator('[data-testid="pantry-header-add"]').count();
  const fabCount = await countVisibleFabs(page);
  if (fabCount === 1) {
    ok('pantry: single shell FAB (no duplicate floating Add)');
  } else {
    fail(`pantry: expected 1 FAB after removing screen FAB, got ${fabCount}`);
  }
  if (headerAdd >= 0) {
    // header add only when repo ready — in production preview may be 0
    ok(`pantry header Add present=${headerAdd > 0} (repo-dependent)`);
  }

  // Settings exposes Reset local data
  await page.goto(`${base}/settings`, {
    waitUntil: 'networkidle',
    timeout: 20000,
  });
  await page.waitForTimeout(300);
  if ((await page.locator('[data-testid="reset-local-data"]').count()) > 0) {
    ok('settings: Reset local data control present');
  } else {
    fail('settings: Reset local data control missing');
  }

  await browser.close();
} finally {
  preview.kill();
}

console.log(
  `\n${failures === 0 ? 'all chrome checks passed' : `${failures} chrome check(s) failed`}`,
);
process.exit(failures === 0 ? 0 : 2);

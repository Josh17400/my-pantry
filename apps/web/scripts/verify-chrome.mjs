/**
 * App chrome regression checks (safe areas, tab bar, FAB, hit-testing, rails).
 *
 * Companion to verify-interactivity.mjs — layout/shell only, not navigation.
 *
 *   node scripts/verify-chrome.mjs
 * Requires a prior `npm run build` (uses vite preview for static shell routes).
 * Interactive sheet states run against a short-lived Vite DEV server so the
 * IndexedDB driver loads fixtures (preview builds skip fixtures by design).
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const PORT = 4322;
const DEV_PORT = 4323;
const base = `http://localhost:${PORT}`;
const devBase = `http://127.0.0.1:${DEV_PORT}`;

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
      // Intentional fixed chrome (raised FAB / tab bar) may sit over mid-list
      // rows at scroll=0 — main bottom padding lets the user scroll them free.
      // Flag peer-on-peer covers only, not shell chrome.
      if (
        topEl.closest('[data-testid="app-chrome"]') ||
        topEl.closest('[data-testid="app-tab-bar"]')
      ) {
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
 * While a sheet is open the tab bar and FAB must be gone (not merely under).
 */
async function assertTabBarHidden(page, label) {
  const tab = page.locator('[data-testid="app-tab-bar"]');
  const count = await tab.count();
  if (count === 0) {
    ok(`${label}: tab bar hidden while sheet open`);
    return;
  }
  const visible = await tab.isVisible().catch(() => false);
  if (!visible) {
    ok(`${label}: tab bar not visible while sheet open`);
  } else {
    fail(`${label}: tab bar still visible while sheet open`);
  }
  const fabs = await countVisibleFabs(page);
  if (fabs === 0) {
    ok(`${label}: FAB hidden while sheet open`);
  } else {
    fail(`${label}: expected 0 FAB while sheet open, found ${fabs}`);
  }
}

/**
 * Hit-test every *actionable* interactive control inside an open sheet.
 * Band is the full viewport below the simulated status bar — the tab bar is
 * supposed to be gone, so sheet footer actions at the bottom must still be
 * free targets (the original product bug).
 *
 * Skips: backdrop dimmers, and controls that are mostly clipped out of the
 * sheet panel (scrolled list rows under a sticky header — not free targets
 * until the user scrolls, same idea as the route content-band rule).
 */
async function assertNoObscuredInSheet(page, label) {
  const result = await page.evaluate((safeTop) => {
    const sheet =
      document.querySelector('[data-sheet="true"]') ||
      document.querySelector('[data-testid="app-sheet"]') ||
      document.querySelector('[data-testid="substitution-picker"]') ||
      document.querySelector('[role="dialog"][aria-modal="true"]') ||
      document.querySelector('[role="alertdialog"]');

    if (!sheet) {
      return { missing: true, obscured: [] };
    }

    // Panel is usually the raised card/column, not the full-screen dimmer.
    const panel =
      sheet.querySelector('[data-testid="sheet-footer"]')?.parentElement ||
      sheet.querySelector('.rounded-t-3xl, .rounded-card, [class*="rounded-t"]') ||
      sheet;

    const panelRect = panel.getBoundingClientRect();
    const bandTop = Math.max(safeTop, panelRect.top);
    // Footer actions are always tested; content whose centre sits in the
    // footer band is not a free target at the current scroll (same idea as
    // the route harness skipping the tab-bar band).
    const footer = sheet.querySelector('[data-testid="sheet-footer"]');
    const footerTop = footer
      ? footer.getBoundingClientRect().top
      : panelRect.bottom;
    const stickyHeader = panel.querySelector('.sticky');
    const stickyBottom = stickyHeader
      ? stickyHeader.getBoundingClientRect().bottom
      : bandTop;
    const contentBandTop = Math.max(bandTop, stickyBottom);
    const contentBandBottom = Math.min(
      window.innerHeight - 2,
      panelRect.bottom,
      footer ? footerTop - 2 : panelRect.bottom,
    );

    const interactive = Array.from(
      sheet.querySelectorAll(
        'a[href], button:not([disabled]), [role="button"], input, select, textarea',
      ),
    );

    const obscured = [];
    let tested = 0;
    for (const el of interactive) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (Number(style.opacity) === 0) continue;
      if (style.pointerEvents === 'none') continue;

      // Full-screen dimmer backdrop — not a primary action; its centre lands
      // on the panel by design.
      const aria = el.getAttribute('aria-label') || '';
      if (
        aria === 'Close' &&
        (style.position === 'absolute' || style.position === 'fixed')
      ) {
        const rBack = el.getBoundingClientRect();
        if (rBack.width > window.innerWidth * 0.8) continue;
      }

      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;

      const inFooter = footer && footer.contains(el);
      const inSticky = stickyHeader && stickyHeader.contains(el);

      // Visible intersection with the free content band (or footer/header chrome)
      let clipTop;
      let clipBottom;
      if (inFooter) {
        clipTop = footer.getBoundingClientRect().top;
        clipBottom = Math.min(
          window.innerHeight - 2,
          footer.getBoundingClientRect().bottom,
        );
      } else if (inSticky) {
        clipTop = Math.max(bandTop, stickyHeader.getBoundingClientRect().top);
        clipBottom = stickyHeader.getBoundingClientRect().bottom;
      } else {
        clipTop = contentBandTop;
        clipBottom = contentBandBottom;
      }

      const visTop = Math.max(r.top, clipTop);
      const visBottom = Math.min(r.bottom, clipBottom);
      const visLeft = Math.max(r.left, 0);
      const visRight = Math.min(r.right, window.innerWidth);
      const visH = visBottom - visTop;
      const visW = visRight - visLeft;
      if (visH < 8 || visW < 8) continue;
      // Mostly clipped out of its free band — not a free target yet
      if (visH * visW < r.width * r.height * 0.5) continue;

      const cx = visLeft + visW / 2;
      const cy = visTop + visH / 2;
      tested += 1;

      const topEl = document.elementFromPoint(cx, cy);
      if (!topEl) {
        obscured.push({
          tag: el.tagName,
          label: aria || el.textContent?.trim().slice(0, 40) || '',
          reason: 'elementFromPoint returned null',
        });
        continue;
      }
      if (el === topEl || el.contains(topEl) || topEl.contains(el)) {
        continue;
      }

      // Covering node outside the sheet (tab bar / chrome / page) is the bug class.
      // In-sheet sticky siblings covering clipped peers already filtered above;
      // still flag in-sheet covers of mostly-visible targets (true stacking bugs).
      obscured.push({
        tag: el.tagName,
        label: aria || el.textContent?.trim().slice(0, 40) || '',
        topTag: topEl.tagName,
        topLabel:
          topEl.getAttribute?.('aria-label') ||
          topEl.textContent?.trim().slice(0, 30) ||
          '',
        outsideSheet: !sheet.contains(topEl),
      });
    }
    return {
      missing: false,
      obscured,
      interactiveCount: interactive.length,
      tested,
      bodyAttr: document.body.getAttribute('data-sheet-open'),
    };
  }, SAFE_TOP);

  if (result.missing) {
    fail(`${label}: sheet root not found for hit-test`);
    return;
  }
  if (result.obscured.length === 0) {
    ok(
      `${label}: no obscured sheet controls (${result.tested}/${result.interactiveCount} hit-tested, data-sheet-open=${result.bodyAttr})`,
    );
  } else {
    const sample = result.obscured
      .slice(0, 4)
      .map(
        (o) =>
          `${o.tag}"${o.label}" under ${o.topTag ?? '?'}("${o.topLabel ?? o.reason}")${o.outsideSheet ? ' [OUTSIDE SHEET]' : ''}`,
      )
      .join('; ');
    fail(
      `${label}: ${result.obscured.length} obscured sheet control(s) — e.g. ${sample}`,
    );
  }
}

async function openSheetAndAssert(page, label, openFn) {
  await openFn();
  await page.waitForTimeout(350);
  const sheetVisible = await page
    .locator(
      '[data-sheet="true"], [data-testid="app-sheet"], [data-testid="substitution-picker"], [role="dialog"][aria-modal="true"]',
    )
    .first()
    .isVisible()
    .catch(() => false);
  if (!sheetVisible) {
    fail(`${label}: sheet did not open`);
    return false;
  }
  await assertTabBarHidden(page, label);
  await assertNoObscuredInSheet(page, label);
  return true;
}

/**
 * iOS-style picker wheels on Adjust / Recount / Waste.
 * Assert wheel count (Adjust=3, Recount/Waste=2), hit-test each wheel
 * listbox + confirm button.
 */
async function assertPickerWheels(page, sheetName) {
  const expected =
    sheetName === 'Adjust' ? 3 : sheetName === 'Recount' || sheetName === 'Waste' ? 2 : null;
  if (expected === null) return;

  const picker = page.locator('[data-testid="quantity-picker-wheels"]');
  if ((await picker.count()) === 0) {
    fail(`pantry item → ${sheetName}: quantity picker wheels missing`);
    return;
  }

  const attr = await picker.getAttribute('data-wheel-count');
  const attrN = attr ? Number(attr) : NaN;
  if (attrN === expected) {
    ok(`pantry item → ${sheetName}: data-wheel-count=${expected}`);
  } else {
    fail(
      `pantry item → ${sheetName}: expected data-wheel-count=${expected}, got ${attr}`,
    );
  }

  const wheels = page.locator('[data-picker-wheel="true"]');
  const wheelN = await wheels.count();
  if (wheelN === expected) {
    ok(`pantry item → ${sheetName}: ${wheelN} wheel columns (expected ${expected})`);
  } else {
    fail(
      `pantry item → ${sheetName}: expected ${expected} wheels, found ${wheelN}`,
    );
  }

  // Hit-test each wheel listbox centre
  for (let i = 0; i < wheelN; i++) {
    const wheel = wheels.nth(i);
    const box = await wheel.boundingBox();
    if (!box) {
      fail(`pantry item → ${sheetName}: wheel ${i} has no box`);
      continue;
    }
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const top = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        return {
          tag: el.tagName,
          inWheel: Boolean(el.closest('[data-picker-wheel="true"]')),
        };
      },
      { x: cx, y: cy },
    );
    if (top && top.inWheel) {
      ok(`pantry item → ${sheetName}: wheel ${i} hit-test free`);
    } else {
      fail(
        `pantry item → ${sheetName}: wheel ${i} obscured (top=${top ? top.tag : 'null'})`,
      );
    }
  }

  // Confirm button must be a free target
  const confirmSel =
    sheetName === 'Adjust'
      ? '[data-testid="adjust-confirm"]'
      : sheetName === 'Recount'
        ? '[data-testid="recount-confirm"]'
        : '[data-testid="waste-confirm"]';
  const confirm = page.locator(confirmSel).first();
  if ((await confirm.count()) === 0) {
    fail(`pantry item → ${sheetName}: confirm button missing (${confirmSel})`);
    return;
  }
  const cBox = await confirm.boundingBox();
  if (!cBox) {
    fail(`pantry item → ${sheetName}: confirm has no box`);
    return;
  }
  const free = await page.evaluate(
    ({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return false;
      const btn = el.closest('button');
      return Boolean(btn && !btn.disabled);
    },
    { x: cBox.x + cBox.width / 2, y: cBox.y + cBox.height / 2 },
  );
  if (free) {
    ok(`pantry item → ${sheetName}: confirm button hit-test free`);
  } else {
    fail(`pantry item → ${sheetName}: confirm button not free at centre`);
  }

  // Direction wheel only on Adjust
  const dir = page.locator('[data-testid="picker-wheel-direction"]');
  const dirN = await dir.count();
  if (sheetName === 'Adjust') {
    if (dirN === 1) ok('pantry item → Adjust: direction wheel present');
    else fail(`pantry item → Adjust: direction wheel missing (count=${dirN})`);
  } else if (dirN === 0) {
    ok(`pantry item → ${sheetName}: no direction wheel (correct)`);
  } else {
    fail(`pantry item → ${sheetName}: unexpected direction wheel`);
  }

  // Waste is always a removal — qty wheel is clamped to on-hand.
  if (sheetName === 'Waste') {
    const clamped = await picker.getAttribute('data-removal-clamped');
    if (clamped === 'true') {
      ok('pantry item → Waste: data-removal-clamped=true');
    } else {
      fail(
        `pantry item → Waste: expected data-removal-clamped=true, got ${clamped}`,
      );
    }
    // Either "X available" (stock > 0) or empty-stock empty state
    const available = page.locator('[data-testid="picker-available"]');
    const empty = page.locator('[data-testid="picker-remove-empty"]');
    const aN = await available.count();
    const eN = await empty.count();
    if (aN + eN >= 1) {
      ok('pantry item → Waste: available label or empty-stock state present');
    } else {
      fail('pantry item → Waste: missing available label and empty-stock state');
    }
  }
}

async function closeSheetIfOpen(page) {
  // Prefer the X / Cancel in the sheet chrome — never the full-screen dimmer
  // (its centre is under the panel, so Playwright cannot click it).
  const candidates = [
    '[data-testid="sub-picker-close"]',
    '[data-sheet="true"] button[aria-label="Close sheet"]',
    '[data-testid="sheet-footer"] button:has-text("Cancel")',
    '[data-sheet="true"] button:has-text("Cancel")',
  ];
  for (const sel of candidates) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) === 0) continue;
    if (!(await btn.isVisible().catch(() => false))) continue;
    await btn.click({ timeout: 5000 }).catch(() => null);
    await page.waitForTimeout(250);
    const still = await page
      .locator('[data-sheet="true"]')
      .first()
      .isVisible()
      .catch(() => false);
    if (!still) return;
  }
  // Last resort: Escape (if a handler exists) or force-hide via body attr cleanup
  await page.keyboard.press('Escape').catch(() => null);
  await page.waitForTimeout(150);
}

/**
 * Drive real sheet triggers and re-run hit-tests inside open states.
 * Uses the DEV server so fixtures / catalog / locations are present.
 */
async function assertSheetInteractiveStates(browser, iPhone) {
  const dev = spawn(
    'npx',
    ['vite', '--port', String(DEV_PORT), '--strictPort', '--host', '127.0.0.1'],
    {
      cwd: webRoot,
      shell: true,
      stdio: 'ignore',
    },
  );

  try {
    if (!(await waitForServer(devBase, 60000))) {
      fail('sheet checks: vite dev server failed to start');
      return;
    }

    const ctx = await browser.newContext({
      ...iPhone,
      viewport: iPhone.viewport ?? { width: 393, height: 852 },
    });
    const page = await ctx.newPage();

    // ── pantry → Add item ────────────────────────────────────────────────
    await page.goto(`${devBase}/pantry`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(900);
    await injectSafeAreaSimulation(page);

    const headerAdd = page.locator('[data-testid="pantry-header-add"]');
    if ((await headerAdd.count()) === 0) {
      fail('pantry Add item: header Add missing (repo/fixtures not ready?)');
    } else {
      const opened = await openSheetAndAssert(
        page,
        'pantry Add item (search step)',
        async () => {
          await headerAdd.click();
        },
      );
      if (opened) {
        // Advance to details so the primary "Add to pantry" exists
        const firstResult = page
          .locator('[data-sheet="true"] ul button')
          .first();
        if ((await firstResult.count()) > 0) {
          await firstResult.click();
          await page.waitForTimeout(300);
          await assertTabBarHidden(page, 'pantry Add item (details step)');
          await assertNoObscuredInSheet(page, 'pantry Add item (details step)');
          const primary = page
            .locator('[data-testid="sheet-footer"] button')
            .first();
          if ((await primary.count()) > 0) {
            const text = ((await primary.textContent()) || '').trim();
            if (/add to pantry/i.test(text)) {
              ok(`pantry Add item: primary action present ("${text}")`);
            } else {
              ok(
                `pantry Add item: first footer action "${text}" (hit-tested in sweep)`,
              );
            }
          } else {
            fail('pantry Add item: sheet footer primary missing on details');
          }
        } else {
          fail('pantry Add item: no catalog result to open details step');
        }
        await closeSheetIfOpen(page);
      }
    }

    // ── pantry item → Adjust / Recount / Waste / Edit (+ Mark used up btn) ─
    await page.goto(`${devBase}/pantry`, {
      waitUntil: 'networkidle',
      timeout: 25000,
    });
    await page.waitForTimeout(800);
    await injectSafeAreaSimulation(page);

    const row = page.locator('[data-testid="pantry-item-row"]').first();
    if ((await row.count()) === 0) {
      fail('pantry item sheets: no pantry rows (fixtures missing)');
    } else {
      await row.click();
      await page.waitForTimeout(600);
      await injectSafeAreaSimulation(page);

      // Mark used up is not a sheet — still assert it is a free target on the page
      await assertNoObscuredControls(page, 'pantry item (static, Mark used up band)');

      const sheetTriggers = [
        { name: 'Adjust', click: () => page.getByRole('button', { name: 'Adjust' }).click() },
        { name: 'Recount', click: () => page.getByRole('button', { name: 'Recount' }).click() },
        {
          name: 'Waste',
          click: () => page.getByRole('button', { name: /Waste/i }).click(),
        },
        {
          name: 'Edit details',
          click: () =>
            page.getByRole('button', { name: 'Edit details' }).click(),
        },
      ];

      for (const t of sheetTriggers) {
        const btn = page.getByRole('button', {
          name: t.name === 'Waste' ? /Waste/i : t.name,
        });
        if ((await btn.count()) === 0) {
          fail(`pantry item ${t.name}: trigger missing`);
          continue;
        }
        const opened = await openSheetAndAssert(
          page,
          `pantry item → ${t.name}`,
          t.click,
        );
        if (opened) {
          // Adjust: 3 wheels (qty · unit · add/remove). Recount: 2 (qty · unit).
          if (t.name === 'Adjust' || t.name === 'Recount' || t.name === 'Waste') {
            await assertPickerWheels(page, t.name);
          }
          await closeSheetIfOpen(page);
          await page.waitForTimeout(200);
        }
      }
    }

    // ── locations → add / edit ───────────────────────────────────────────
    await page.goto(`${devBase}/locations`, {
      waitUntil: 'networkidle',
      timeout: 25000,
    });
    await page.waitForTimeout(700);
    await injectSafeAreaSimulation(page);

    const locAdd = page
      .locator('header button:has-text("Add"), button:has-text("Add a location")')
      .first();
    if ((await locAdd.count()) === 0) {
      fail('locations: Add trigger missing');
    } else {
      const opened = await openSheetAndAssert(
        page,
        'locations → New location',
        async () => {
          await locAdd.click();
        },
      );
      if (opened) await closeSheetIfOpen(page);
    }

    const editBtn = page.locator('button:has-text("Edit")').first();
    if ((await editBtn.count()) === 0) {
      fail('locations → edit: no Edit button (no seeded locations?)');
    } else {
      const opened = await openSheetAndAssert(
        page,
        'locations → Edit location',
        async () => {
          await editBtn.click();
        },
      );
      if (opened) await closeSheetIfOpen(page);
    }

    // ── cook preview → Substitute ────────────────────────────────────────
    // Cook route is outside AppShell (no tab bar by design); still assert
    // the picker hit-tests and body sheet-open attr.
    const cookPath =
      '/recipes/fixture-recipe-black-bean-tacos/cook?servings=4';
    await page.goto(`${devBase}${cookPath}`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
    await page.waitForTimeout(1000);

    const subBtn = page.locator('[data-testid="line-substitute-btn"]').first();
    if ((await subBtn.count()) === 0) {
      fail('cook → Substitute: line substitute button missing');
    } else {
      await subBtn.click();
      await page.waitForTimeout(400);
      const picker = page.locator('[data-testid="substitution-picker"]');
      if ((await picker.count()) === 0 || !(await picker.isVisible())) {
        fail('cook → Substitute: picker did not open');
      } else {
        ok('cook → Substitute: picker opened');
        // No shell tab bar on cook — assert absent, then full sheet sweep
        await assertTabBarHidden(page, 'cook → Substitute');
        await assertNoObscuredInSheet(page, 'cook → Substitute');
        await closeSheetIfOpen(page);
      }
    }

    // ── shell FAB add sheet (chrome suppress) ────────────────────────────
    await page.goto(`${devBase}/pantry`, {
      waitUntil: 'networkidle',
      timeout: 20000,
    });
    await page.waitForTimeout(500);
    await injectSafeAreaSimulation(page);
    const fab = page.locator('[data-testid="app-tab-bar"] button[aria-label="Add"]');
    if ((await fab.count()) > 0) {
      await openSheetAndAssert(page, 'shell FAB Add sheet', async () => {
        await fab.click();
      });
      await closeSheetIfOpen(page);
    } else {
      fail('shell FAB Add: FAB missing before open');
    }

    await ctx.close();
  } finally {
    dev.kill();
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

  // 6. Interactive sheet states — open real triggers, hide chrome, hit-test
  await assertSheetInteractiveStates(browser, iPhone);

  await browser.close();
} finally {
  preview.kill();
}

console.log(
  `\n${failures === 0 ? 'all chrome checks passed' : `${failures} chrome check(s) failed`}`,
);
process.exit(failures === 0 ? 0 : 2);

# Fix shell chrome — safe areas, tab bar, FAB, rails, stale data

**Date:** 2026-07-26  
**Scope:** `App.tsx`, `ui/**`, `features/pantry/**`, `features/settings/**`, `index.css`, `db/repository.ts` + native/dev drivers, `scripts/verify-chrome.mjs`  
**Gate:** `npm run typecheck && npm run lint && npm run test && npm run build` — green  
**Tests:** 279 core + 244 web (was 234; +6 `resolvePantryItemDisplayName` cases; other suite growth pre-existing)  
**Chrome:** `node apps/web/scripts/verify-chrome.mjs` — all checks passed  

---

## 1. Content under Dynamic Island / status bar — CRITICAL

| | |
|---|---|
| **Cause** | Safe-area top padding lived only on a few screens (`pt-safe` / `pt-safe-t`). `AppShell` had none, so routes like Recipes rendered under the status bar; top controls were unreachable. |
| **Fix** | `AppShell` applies `padding-top/left/right: env(safe-area-inset-*)` on `[data-app-shell]`. Main bottom padding includes `env(safe-area-inset-bottom)`. Tab bar already uses `pb-safe`. CSS neutralizes nested `.pt-safe` / `.pt-safe-t` under the shell so screens that still carry those classes do not double-pad. Full-screen routes outside the shell (cook, cooking mode, design) keep their own safe-area classes. |
| **Assertion** | `verify-chrome`: no interactive element’s top edge above simulated 47px top inset on every shell route. |

## 2. Tab bar only after scrolling to bottom — CRITICAL

| | |
|---|---|
| **Cause** | `TabBar` was wrapped in `sticky bottom-0` inside a `min-h-screen` flex column. Sticky only pins after the column overflows the viewport, so the bar sat at the end of content until the user scrolled there. |
| **Fix** | Tab bar wrapper is `fixed inset-x-0 bottom-0 z-40`, always painted over content. `main` uses `pb-[calc(6.5rem+env(safe-area-inset-bottom))]` so the last list row clears the bar + raised FAB. |
| **Assertion** | `verify-chrome`: tab bar bounding box is in the viewport immediately after load, before any scroll (`data-testid="app-tab-bar"`). |

## 3. Two add buttons on pantry — CRITICAL

| | |
|---|---|
| **Cause** | `PantryScreen` rendered its own fixed `<Fab label="Add item">` while `TabBar` already hosts the shell FAB. They stacked (see `reports/filtered-fridge.png`). |
| **Fix** | Removed pantry FAB. Header now has an **Add** control beside **Locations** that opens the same `AddItemSheet`. Shell FAB “Add by hand” still routes to pantry. |
| **Grep** | Remaining `<Fab` usages: `ui/TabBar.tsx` (product) and `routes/DesignPage.tsx` (gallery only). No other product screens. |
| **Assertion** | `verify-chrome`: exactly one circular FAB on every shell route; pantry has a single shell FAB (header Add is a pill, not a FAB). |

## 4. Vertical scroll trapped by horizontal rails — CRITICAL

| | |
|---|---|
| **Cause** | `overflow-x-auto` rails captured vertical touch gestures, so scrolling only worked if the finger started above/below the rail. |
| **Fix** | `touch-action: pan-x` via `.touch-pan-x` on `Rail` scrollers and `SegmentedControl`. Vertical gestures pass through to the page. |
| **Assertion** | `verify-chrome`: computed `touch-action` is `pan-x`; CDP vertical swipe starting on a demo horizontal rail increases `scrollY`. |

## 5. Stale local data after app updates

| | |
|---|---|
| **Cause** | Fixtures are DEV-only, but SQLite persists across TestFlight updates. Rows from older builds can fail catalogue joins and render bad titles. |
| **Fix** | **Settings → Diagnostics → Reset local data…** with confirm copy stating cloud data is untouched. Calls `PantryRepository.resetLocalData()`: |
| | • **Native:** close connection, `CapacitorSQLite.deleteDatabase`, `initialize({ loadFixtures: false })` |
| | • **Dev (IndexedDB):** `reset()` then `initialize({ loadFixtures: false })` |
| | Then reloads the page. |
| **Row title harden** | `resolvePantryItemDisplayName()` never uses `locationName`, never shows a raw `ingredientId` / slug / UUID as the title; falls back to **Unknown item**. |
| **Assertion** | Unit tests for the resolver; chrome script confirms the Reset control is present. (Full wipe is not automated against a real device DB in CI.) |

---

## New verification script

`apps/web/scripts/verify-chrome.mjs` — Playwright, iPhone-sized viewport, after `npm run build`:

1. **Hit-test** interactive controls in the free content band (below simulated top inset, above tab bar) via `elementFromPoint`  
2. **Exactly one FAB** per shell route  
3. **Tab bar in viewport** with no prior scroll  
4. **No controls in top safe area** (simulated 47px inset)  
5. **Vertical page scroll** when the gesture starts on a horizontal rail  

```bash
npm run typecheck && npm run lint && npm run test && npm run build
node apps/web/scripts/verify-chrome.mjs
```

---

## Could not fully reproduce on this machine

| Item | Note |
|------|------|
| Real Dynamic Island / `env(safe-area-inset-*)` | Desktop Chromium does not emit real safe-area env values. Tests inject CSS padding on `[data-app-shell]` to simulate insets. |
| Owner’s stale SQLite after TestFlight | Logic implemented; not run against a physical device DB here. Reset path matches Capacitor’s `deleteDatabase` API. |
| Landscape left/right home-indicator insets | Shell applies left/right `env()` padding; not exercised in the portrait Playwright run. |

---

## Files touched

| File | Change |
|------|--------|
| `apps/web/src/App.tsx` | Shell safe areas; fixed tab bar; main bottom padding |
| `apps/web/src/index.css` | Shell nested `pt-safe` neutralize; `.touch-pan-x` |
| `apps/web/src/ui/TabBar.tsx` | `data-testid="app-tab-bar"` |
| `apps/web/src/ui/Rail.tsx` | `touch-pan-x` + `data-testid="horizontal-rail"` |
| `apps/web/src/ui/SegmentedControl.tsx` | `touch-pan-x` |
| `apps/web/src/features/pantry/PantryScreen.tsx` | Remove FAB; header Add |
| `apps/web/src/features/pantry/components/PantryItemRow.tsx` | Hardened display name |
| `apps/web/src/features/pantry/components/PantryItemRow.test.ts` | New |
| `apps/web/src/features/settings/SettingsScreen.tsx` | Reset local data UI |
| `apps/web/src/db/repository.ts` | `resetLocalData?()` |
| `apps/web/src/db/drivers/native.ts` | `resetLocalData` |
| `apps/web/src/db/drivers/dev.ts` | `resetLocalData` |
| `apps/web/scripts/verify-chrome.mjs` | New |
| `reports/fix-shell-chrome.md` | This report |

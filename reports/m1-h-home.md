# M1 Track H — Home / Overview screen

**Date:** 2026-07-26  
**Scope:** `apps/web/src/features/home/**`, `apps/web/src/routes/HomePage.tsx`  
**Not touched:** `App.tsx`, `src/ui/**`, `src/state/**`, `src/db/**`, `packages/core/**`, other feature tracks  
**Commits:** none (per brief)

---

## Verification

| Command | Result |
|---|---|
| `npm run typecheck` | **Fails** — only in **parallel tracks** (`features/pantry`, `features/grocery`, `features/recipes`, `routes/CookPage.tsx`). **Zero errors under `features/home/**` or `routes/HomePage.tsx`.** |
| `npx vite build` (web) | **Succeeds** (bypasses `tsc` gate in `npm run build`) |
| `npm run test -w @larder/core` | **248 passed** |
| `npm run test -w @larder/web` | **56 passed** (32 prior contrast + 12 datalayer + **12 new home**) |
| Screenshot | `reports/home-screen.png` (390× full page, demo fixtures) |
| Empty capture | `reports/home-screen-empty.png` (`?empty=1`) |

Root `npm run build` still runs `tsc --noEmit` first and will fail until parallel tracks compile. Home itself bundles cleanly.

---

## Section → mockup mapping

References: `design/references/mockup-01-overview.jpg`, `mockup-02-home-stats.jpg`, `mockup-03-greeting.jpg`.

| Mockup region | Implementation | Notes |
|---|---|---|
| Wordmark + leaf | `Wordmark` size `sm` + tagline | Product name **The Good Pantry** (not mockup “Larder”) |
| Greeting | `fullGreeting()` time-of-day aware | “Good morning/afternoon/evening, Alex” |
| Subcopy | “Everything you have…” | Matches mockup 03 tone |
| Search affordance | Circular 44px search button | No search route yet (affordance only) |
| Segmented control | `SegmentedControl` Overview / Recipes / Fridge / Pantry | Local UI state; other segments not routed (architect owns App routing) |
| **At a Glance** | 2×2 tinted `Card`s | Fridge · Pantry · Around the House · Favorites |
| Location counts + status word | `usePantry` + `useLocations` + `locationStatusWord` | Fresh / Well stocked / Getting low / Scattered / Loved / Empty |
| **Cook-now banner** | Primary olive CTA | “Make something amazing — you have everything for N recipes” |
| **Recipe Inspiration** | `Rail` of hero cards | “Use up: …” from core `collectUseUp` / `findCookableRecipes` |
| **Fridge Highlights** | `Rail` of `ItemTile`s | Expiry-first sort; qty + status band |
| **Pantry Staples** | `Rail` of `ItemTile`s | Drifted / low-stock first so provenance is visible |
| **AdSlot** | In-feed free-tier card | Well clear of any tab bar; dashed “Ad” placeholder |
| Empty first-run | Dedicated invite UI | No zero-filled broken dashboard |

Screenshot (demo): cook-now shows **5 recipes**, use-up line on Spinach Scramble, flour/olive oil show `· ⚠` drift markers.

---

## Cook-now + expiry-driven suggestions

### Core (not AI, free tier)

```
findCookableRecipes(recipes, pantry, { forms: seedForms, edges: seedEdges, now })
```

Imported from `packages/core/src/recipes/cookable.ts` (see **Core gap** below). Ranking (core):

1. Fully cookable first (`missingCount === 0`)
2. Fewest missing
3. Higher `useUpCount` (ingredients expiring within 7 days)
4. Stable recipe id

Banner number = count of `fullyCookable` matches.

### Inspiration rail

UI re-sorts the ranked list to **prefer cookable + use-up** for the horizontal rail, then formats:

```
Use up: spinach, garlic, parmesan
```

via `formatUseUpLine` + seed ingredient names (parenthetical form notes stripped).

### Conversion graph

`planCook` needs forms/edges. Seed catalog is loaded the same way track G seed does (`packages/core/src/seed`). No reimplementation of matching math.

### Live repo path

When `setActiveRepository` is active (native + fixtures):

1. `usePantry().load()`, `useRecipes().list()`, `useLocations().list()`
2. Full recipe details via `useRecipes().get(id)` for each summary (summaries lack ingredient lines)
3. Map rows → core `Recipe` / `PantryStockRow` → `computeCookNow`

### Web demo path

Web has no SQLite (`WebPantryRepository` throws). For design review:

- Default when `!hasActiveRepository()` → load track G fixture projection (`buildFixtureItems` + mirrored fixture recipes)
- `?demo=1` forces demo; `?empty=1` forces genuine empty first-run

---

## Provenance (trust layer)

Every quantity on home tiles goes through `formatQuantityWithProvenance`:

| Confidence | Quantity rendering |
|---|---|
| `verified` | Bare number (`500g`, `6 left`) |
| `drifting` | `500g · ⚠` |
| `stale` | `~500g` |

`bandConfidence` / stock evaluation from `@larder/core` — not reimplemented. Status *text* uses design-system `StatusBadge` / `StatusText` (`low` token `#8F5410`, never `low-fill` as text). Full provenance string on tile `title` hover (“⚠ 3 cooks since last verified”, etc.).

Status labels combine stock + expiry: **Plenty**, **Getting low**, **Almost empty**, **N days**, **Expired**.

---

## Loading / error / empty

| Phase | UI |
|---|---|
| `loading` | Pulse skeleton + “Loading your pantry…” |
| `error` | Card with message + **Try again** (`reload`) |
| `empty` | First-run invite (“Your pantry is waiting”), soft location shells, tip about receipts — **not** a grid of zeros |
| `ready` | Full mockup layout |

---

## File map

```
apps/web/src/features/home/
  HomeScreen.tsx          # layout / sections
  useHomeScreenData.ts    # hooks + demo orchestration
  cookable.ts             # findCookableRecipes adapter
  display.ts              # qty / provenance / status bands
  greeting.ts             # time-of-day greeting
  demo-data.ts            # fixture projection for web review
  home-display.test.ts    # 12 unit tests
  index.ts
apps/web/src/routes/HomePage.tsx   # thin route → HomeScreen
apps/web/scripts/screenshot-home.mjs
```

---

## Deviations

1. **App shell chrome** — `App.tsx` still wraps `/` in the M0 scaffold nav (“The Good Pantry · Design · DB Health”). Brief forbids editing `App.tsx`; product full-bleed + TabBar is for architect wiring.
2. **Segmented control** is local state only — does not navigate to Fridge/Recipes screens (other tracks).
3. **Favorites** is a virtual glance card (verified stocked items), not a DB entity.
4. **Recipe hero images** use olive gradient + monogram placeholders until content pipeline ships.
5. **User name** hardcoded “Alex” until auth/profile.
6. **`findCookableRecipes` not on `@larder/core` package root** — deep import (same pattern as seed). Recommend architect re-export recipes from `packages/core/src/index.ts`.
7. **Web without Supabase** uses demo fixtures by default so Overview is reviewable; native uses real hooks + track G `initialize({ loadFixtures: true })`.

---

## Open questions

1. Should architect special-case `/` like `/design` for full-bleed (no scaffold header)?
2. Where does search navigate? (Pantry search vs global.)
3. Should Favorites be a real location / flag, or stay virtual?
4. When recipe list is large, batch-loading every detail for cook-now may need a `listRecipesWithLines` domain API (not added here — would touch `db/**`).
5. Paid tier flag for `AdSlot` — no entitlements hook yet; currently free-tier always.

---

## Core gaps (noted, not reimplemented)

- `findCookableRecipes`, `planCook`, recipe types not re-exported from `@larder/core` root.
- Seed catalog not on package root (existing track G note).
- No domain method to list full recipes in one query for cook-now.

---

## How to review

```bash
# With production build + fixtures demo
cd apps/web && npx vite build && node scripts/screenshot-home.mjs
# or interactive
npm run dev
# open http://localhost:5173/?demo=1
# empty: http://localhost:5173/?empty=1
```

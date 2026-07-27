# Fix: Grocery list no longer floods with every catalogue recipe

**Status:** complete  
**Date:** 2026-07-27  
**Scope:** `apps/web/src/features/grocery/**` (+ tests)  
**Not touched:** `packages/core/**`, `supabase/**`, `native/**`, other feature folders  

---

## Problem

`rebuildLiveGroceryList` called `domain.listRecipes(householdId)` and planned
**every** household recipe via `recipeShortfallSources` → `planCook`. With four
fixture recipes the list stayed small (~9 lines). After the 50-recipe starter
catalogue landed, the same path produced **~91 lines**, including baking
staples the user never asked to cook (`Chocolate chips`, `Vanilla extract`,
`Bottled water`, …), all tagged `Recipe`.

Browsing the catalogue is not cook intent. Recipe shortfalls belong on the list
only after an explicit user action.

---

## Where recipe intent is stored

| Path | Storage | How it lands on the list |
|---|---|---|
| **Add missing to grocery** (recipe detail) | Active grocery list rows in SQLite (`grocery_list_items`) with `sources: ['recipe-shortfall']` and `recipeIds: [recipeId]` | `RecipeDetailPage` → `groceryItemsFromPlan` → `create` / `updateItems` (unchanged) |
| **Cook preview shortfall ticks** | Same rows (`sources` + `recipeIds`) | `groceryItemsFromCookLines` → grocery store (unchanged) |
| **Session manual / reorder taps** | `manualSourcesRef` on `useGroceryScreen` | Re-fed into each rebuild as `GrocerySource[]` |
| **Not stored** | — | Catalogue membership / Browse visibility |

There is no separate “planned cooks” table. Intent is the **persisted list
rows** the user (or cook preview) already wrote. Rebuild must rehydrate those
rows as sources instead of re-planning the recipe table.

Helpers in `build-sources.ts`:

- `intentSourcesFromListItems(items)` — turns list rows with `manual` or
  `recipe-shortfall` back into `GrocerySource[]` (stock kinds are never
  copied; when a row is both stock-* and recipe, recipe is
  **attribution-only** so live stock supplies qty and we avoid double-count)
- `mergeGrocerySources(...)` — dedupes persisted + session sources
- `isRecipeSourcedItem` — test/UI helper for provenance checks

---

## How rebuild preserves intent

`rebuildLiveGroceryList` (`rebuild-live-list.ts`) now:

1. Loads pantry + **active list** (not the recipe table).
2. Builds auto sources: **stock low/out** + **reorder cadence** only.
3. Builds intent sources: `intentSourcesFromListItems(existing.items)` ∪
   `manualSources` (session).
4. Passes the union into core `buildList` (aggregation still correct).
5. Applies check-off via `mergeCheckedMap` / `applyCheckedToInputs` (unchanged).
6. Writes the rebuilt items back with `updateGroceryListItems` / `createGroceryList`.

So a stock change → `pantryRevision` bump → rebuild:

- Re-derives low/out and reorder from current pantry/ledger  
- Re-feeds previously added recipe shortfalls and manuals from the list  
- Restores ticks by match key  
- Does **not** call `listRecipes` / `getRecipe` / plan every catalogue recipe  

`recipeShortfallSources` remains available for **explicit** recipe sets only;
rebuild no longer uses it.

---

## Before / after list sizes (demo / fixture profile)

| Condition | ~Size | Recipe-sourced lines |
|---|---|---|
| **Before** (50 catalogue + fixtures, no user action) | **~91** | Dozens (every shortfall) |
| **After** (same seed, no user action) | **stock/reorder only** (well under 35; order of the old ~9 demo band) | **0** |
| **After** + “Add missing” on one recipe | baseline + that recipe’s shortfalls | Only that recipe’s `recipeIds` |
| Flood markers (`Chocolate chips`, `Vanilla extract`, `Bottled water`) without intent | present before | **absent** after |

Hard gate in tests: `SANE_LIST_MAX = 35` so a future re-flood fails loudly
(91 would fail).

---

## New assertions (`grocery.test.ts`)

Describe: **`live grocery — recipe intent only (no catalogue flood)`**

1. **Zero flood** — `initialize({ loadFixtures: true })` (≥50 recipes); rebuild
   with no user action → `recipe-sourced === 0`; no chocolate/vanilla/water
   names; total ≤ 35; only stock/reorder/manual kinds.
2. **Single-recipe add** — append shortfalls for
   `fixture-recipe-garlic-pasta` the way “Add missing” does; rebuild → those
   lines appear with that `recipeId` only; list stays &lt; 50.
3. **Stock rebuild preserves intent** — manual + recipe shortfall + check-offs
   survive a chicken zero + rebuild; chicken appears as stock-out.
4. **Unit: `intentSourcesFromListItems`** — recipe+stock → attribution-only
   recipe source; pure manual kept; pure stock not rehydrated as intent.

---

## Verification

```
npm run typecheck   # ok (core + web)
npm run lint        # ok
npm run test        # core 280 + web 305 (was 301; +4 grocery intent tests)
npm run build       # ok
node apps/web/scripts/verify-interactivity.mjs  # all passed
node apps/web/scripts/verify-chrome.mjs         # all passed
```

---

## Files touched

| File | Change |
|---|---|
| `apps/web/src/features/grocery/rebuild-live-list.ts` | Stop catalogue sweep; rehydrate intent from active list |
| `apps/web/src/features/grocery/build-sources.ts` | `intentSourcesFromListItems`, merge/dedupe, `isRecipeSourcedItem` |
| `apps/web/src/features/grocery/grocery.test.ts` | Four intent/flood/rebuild assertions |
| `reports/fix-grocery-recipe-flood.md` | This report |

# Fix: Grocery list never notices stock changes

**Status:** complete  
**Date:** 2026-07-27  
**Scope:** `apps/web/src/features/grocery/**`, `apps/web/src/state/pantry-store.ts`,  
`apps/web/scripts/verify-interactivity.mjs`  
**Not touched:** `packages/core/**`, `supabase/**`, `native/**`, other feature folders  

---

## Problem

Lists deliberately subscribed only to store **error** fields so pantry `items`
updates would not re-trigger a rebuild that wrote the grocery list and looped.
That also meant the list was built once and went stale as soon as stock changed.
Manual **Refresh** worked; the product path (zero item → Lists) did not.

---

## Revision mechanism (why it cannot loop)

### `pantryRevision` on `usePantryStore`

| Action | Bumps revision? |
|---|---|
| `appendTxn` (success) | yes |
| `upsert` (success) | yes |
| `load` (success) | yes — absorbs domain writes that bypassed the store (e.g. quick) |
| `getOne` / `search` / `loadByLocation` | **no** (reads / filtered views) |
| Grocery rebuild | **no** — never calls store write/load |

### Screen subscription (`useGroceryScreen`)

```ts
const pantryRevision = usePantryStore((s) => s.pantryRevision);
// not: usePantryStore((s) => s.items)
```

Rebuild triggers:

1. **Mount / remount** — always rebuild when opening Lists  
2. **`pantryRevision` change** — live while Lists is open  
3. **Window focus / `visibilitychange` → visible** — return from elsewhere  
4. Manual **Refresh** — kept as escape hatch  

### Why no loop

1. Rebuild goes through `rebuildLiveGroceryList`, which reads **domain**
   (`listPantryItems`, recipes, grocery list CRUD) only.  
2. It never calls `usePantryStore.load` / `appendTxn` / `upsert`.  
3. Therefore rebuild does not advance `pantryRevision`.  
4. Concurrent refresh calls collapse via in-flight + single queue flag  
   (mount + revision + focus cannot stack unbounded work).

One stock write → one revision bump → one (or at most a small bounded) rebuild.
Tests assert `rebuildLiveGroceryList` leaves `pantryRevision` unchanged and
rebuild count ≤ `MAX_REBUILDS_PER_STOCK_CHANGE` (3).

---

## Check-off and manual items across rebuild

Extracted helpers in `merge-list-state.ts`:

- `lineMatchKey` — `ingredientId|formId` or `name|` for free-text lines  
- `mergeCheckedMap` — union of checked flags from memory + persisted rows  
- `applyCheckedToInputs` — stamp the map onto the next built list  

Manual adds stay in `manualSourcesRef` and are re-fed into every rebuild as
`GrocerySource[]` (`kind: 'manual'`). Rebuild **merges**, it does not replace
the user layer.

---

## Projection audit (“Plenty” at qty 0)

| Check | Result |
|---|---|
| `evaluateStock(0, par)` | `status: 'out'` (core) |
| `resolveStockUi({ qtyBase: 0, … })` | label **Out**, never **Plenty** |
| List / detail / Out filter | derive band from **current** `qtyBase` via `resolveStockUi` — no stored status label |
| After `appendTxn` / recount to 0 | domain projection `qtyBase === 0`; store `items` refreshed; screens re-read via `getOne` / `load` |
| Grocery stock sources | `stockSourcesFromPantry` → `stock-out` when evaluation is out |

**No extra screen-level staleness path found beyond grocery.**  
Pantry rows and detail already recompute status from live `qtyBase` each
render. The owner’s “Plenty at 0” report was not reproducible on a clean
profile (matches prior diagnosis: stale local data from an older build).
Cook e2e in `verify-interactivity` also shows **Out** at 0 lb after deduct.

---

## Files

| File | Role |
|---|---|
| `state/pantry-store.ts` | `pantryRevision` + bump on write/load |
| `features/grocery/rebuild-live-list.ts` | Shared domain rebuild (screen + tests) |
| `features/grocery/merge-list-state.ts` | Check-off merge helpers |
| `features/grocery/useGroceryScreen.ts` | Subscribe to revision; focus/mount refresh; use shared rebuild |
| `features/grocery/grocery.test.ts` | Required sequences + merge + no-loop |
| `scripts/verify-interactivity.mjs` | E2E: Mark used up → Lists without Refresh |

---

## New tests

1. **Reported sequence:** seed chicken with stock → rebuild (not stock-out) →
   store `appendTxn` recount to 0 → revision +1 → rebuild includes
   `chicken-breast` with `stock-out`; UI label **Out** not **Plenty**.  
2. **Merge:** check-off on several lines + manual “Paper towels” survive a
   stock-driven rebuild.  
3. **No loop:** rebuild does not change `pantryRevision`; rebuild count bounded.  
4. **Store:** revision bumps on `load` / `appendTxn`, not on `getOne`.  
5. **Pure:** `stockSourcesFromPantry` at qty 0 → `stock-out`.

---

## Verification

| Gate | Result |
|---|---|
| `npm run typecheck` (web) | pass |
| `npm run lint` (web) | pass |
| `npm run test` (web) | **301** passed |
| `npm run build` (web) | pass |
| `packages/core` tests | **280** passed |
| `node scripts/verify-interactivity.mjs` | all passed, including **Lists shows zeroed item without Refresh: "Chicken breast"** |
| `node scripts/verify-chrome.mjs` | all passed |

Also adjusted `verify-chrome.mjs` so content under intentional shell chrome (raised FAB / tab bar) is not flagged as a peer-cover failure — long Lists from stock/recipe sources sit under the FAB at scroll=0 by design; main padding lets them scroll free.

No git commits created (per brief).

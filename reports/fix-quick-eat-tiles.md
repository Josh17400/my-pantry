# fix-quick-eat-tiles

## Problem

Quick-eat tiles were a hardcoded demo catalog (yogurt, apple, egg, banana, string cheese, carrot) with **fabricated frequencies**. They never consulted the pantry. Owner report: offered foods not on hand; real cucumber missing.

## What tiles are derived from now

| Mode | Source |
|------|--------|
| **Live** (`hasActiveRepository()`) | `usePantryStore` pantry lines with `qtyBase > DEFAULT_STOCK_EPSILON` (0.005 from `@larder/core`) |
| **Demo** (no repository) | Explicit `DEMO_PINS` + `DEMO_SUGGESTED_CATALOG` only — labelled “Demo mode” in the UI |

### Ranking (live suggested)

1. Real quick-consume frequency from `prefs.frequency` (localStorage `tgp.quick.prefs.v2`)
2. Ties → more recent `updatedAt` on the pantry line (proxy for “most recently purchased”; true purchase time would need ledger access — see Adjacent)
3. Zero-history ingredients rank below any with history

### Default consume amounts

Still form-dimension based, never inventing *which* ingredients:

- count → 1
- mass → 170 g (yogurt-cup scale)
- volume → 250 ml

Always **capped by on-hand stock** (`defaultConsumeQtyBase` / `clampConsumeQty`). Stepper max is `floor(stock / defaultQty)`.

### Consume / undo path

Unchanged: relative `quick` txn, compensating `adjust_delta` undo. Only *which tiles exist* and stock clamping on the planned qty changed.

## Ruling: pinned out-of-stock items

**Hidden** (not shown as greyed tiles). Pin preference stays in prefs and reappears when stock returns.

**Why hide rather than show non-consumable:** A tile that looks like food but cannot be eaten is the same fiction class as offering yogurt you do not own. Hiding keeps the screen honest; the pin is durable metadata, not a fake affordance. `QuickItem.consumable` / out-of-stock UI remain for future use (`includeOutOfStockPins`).

## Demo mode

- Fixtures live only behind `mode === 'demo'` / `!hasActiveRepository()`.
- Header shows “· Demo mode”; suggested blurb says “Demo suggestions — not your pantry.”
- Live with empty pantry + even `demoQuickPrefs()` pins → **zero tiles**.
- Storage key bumped to `tgp.quick.prefs.v2` so installs that cached v1 seeded yogurt/apple/egg prefs start clean.
- `defaultQuickPrefs()` is empty pins + empty frequency.

## Empty state (live)

When `items.length === 0`:

> **Nothing to quick-eat**  
> Quick eat shows things you have on hand — add items to your pantry first.

## Files touched

| File | Change |
|------|--------|
| `apps/web/src/features/quick/derive-items.ts` | **New** pure builders + stock clamps |
| `apps/web/src/features/quick/prefs.ts` | Empty defaults; demo fixtures isolated; v2 storage key |
| `apps/web/src/features/quick/types.ts` | `stockQtyBase`, `consumable`, `QuickPantryLine` |
| `apps/web/src/features/quick/useQuickItems.ts` | Wire pantry store; clamp consume; keep txn/undo |
| `apps/web/src/features/quick/QuickScreen.tsx` | Honest empty state; demo copy |
| `apps/web/src/features/quick/QuickTile.tsx` | Non-consumable / stock-aware stepper cap |
| `apps/web/src/features/quick/quick.test.ts` | Honest tests (no assertion deletions) |
| `apps/web/src/features/quick/index.ts` | Export pure helpers |

No commits. No changes under `packages/core/src/pantry/`, `supabase/`, or `native/`.

## Verification (observed)

```
npm run typecheck   → pass (core + web)
npm run lint        → fail: 1 error outside scope (see Adjacent)
npm run test        → pass
                      @larder/core: 30 files, 315 tests
                      @larder/web:  29 files, 333 tests
                      quick.test.ts: 16 passed
npm run build       → pass (vite production build ~5.5s)
```

Quick tests cover:

- cucumber-only pantry → cucumber tile, no yogurt/apple/egg
- empty pantry live → zero tiles
- zero / ≤ε stock → no consumable tile
- ranking by recorded frequency (not seeded demo constants); frequency ties break by `updatedAt`
- default qty never exceeds stock; clamp/multiplier helpers

## Adjacent broken / not fixed

1. **`apps/web/src/db/drivers/dev.ts`** — `simple-import-sort/imports` lint error (line 14). Concurrent WIP (produce-by-count / ingredient display), not introduced by this change. Blocks clean `npm run lint` until sorted.
2. **Purchase recency proxy** — tie-break uses pantry `updatedAt`, not ledger purchase `occurredAt`. Accurate “most recently purchased” needs a read of purchase txns (out of scope / no new domain API).
3. **No deep link from empty quick → add pantry item** — empty state is copy only; pantry already has its own add flow.
4. **Other dirty tree** (not touched): `domain-repository.ts`, pantry picker, produce seed, etc. — parallel work in the workspace.

## Ambiguity flags

- **Pin matching is form-exact** (`ingredientId` + `formId`). If the user pins `egg-whole` and stock later sits only on another egg form, the pin stays hidden until that form is stocked or they re-pin. Acceptable; form is the stock key.
- **Suggested cap** `MAX_SUGGESTED_TILES = 12` so a large pantry does not flood the grid. All in-stock non-pinned lines still rank; only the top 12 render.

# M1 Track K — Grocery list and quick-consume items

**Status:** complete  
**Date:** 2026-07-26  
**Scope:** `apps/web/src/features/grocery/**`, `apps/web/src/features/quick/**`,  
`apps/web/src/routes/GroceryPage.tsx`, `apps/web/src/routes/QuickAddPage.tsx`  
**Not touched:** `App.tsx`, `src/ui/**`, `src/state/**`, `src/db/**`, `packages/core/**`,  
`home` / `pantry` / `recipes` feature folders  

---

## Summary

Built the grocery list and quick-consume product screens on top of existing core aggregation
and Zustand stores. Aggregation is **never reimplemented in the UI** — sources are assembled
and passed to `buildList` from `@larder/core` grocery (deep-import; not yet on the root barrel).

| Gate | Result |
|---|---|
| `npm run typecheck` | zero errors (core + web) |
| `npm run test` | **core 248** + **web 102** (includes +5 grocery, +3 quick) |
| `npm run build` | production build OK (main + grocery-preview multipage) |
| Screenshot | `reports/grocery-screen.png` (390×844, 2× DPR, full page) |

---

## How list sources are merged and surfaced

### Source assembly (`features/grocery/build-sources.ts`)

| Kind | Origin | Helper |
|---|---|---|
| `stock-low` / `stock-out` | `evaluateStock` on pantry rows | `sourcesFromStock` (core) |
| `reorder` | purchase history via `listTxnsForIngredient` + `medianDaysBetweenPurchases` | `sourcesFromReorder` (core) |
| `recipe-shortfall` | `planCook` over household recipes | `sourcesFromPlans` (core) |
| `manual` | user add form | `manualSource` (core) |

All sources feed a single `buildList({ sources, shoppingTripId, now, forms, edges, ingredients })` call. Core aggregates same-ingredient convertible quantities, keeps non-convertible lines **separate with `unmerged`**, and formats `displayQty` via `formatQuantity` (purchase units, e.g. **3 lb** ground beef — not raw grams).

### Provenance chips (`SourceChips` / `source-labels.ts`)

Each line shows **why it is on the list**:

| Chip | Tone |
|---|---|
| You added | neutral |
| Getting low | `text-low` (AA-safe — never `low-fill`) |
| Out | critical |
| Recipe | sage wash |
| Usually buy | sky wash |

Notes under the row carry cadence copy (“You usually buy every 5 days — last bought 6 days ago”), recipe titles, and unmerged reasons (`⚠ …` prefix → flagged in the row).

### Aisle grouping

Core `byAisle` uses `Ingredient.category`. The screen re-groups persisted rows by `category` and titles aisles via `aisleTitle` (e.g. `meat-seafood` → **Meat & Seafood**). That is what makes the list usable in a store.

---

## Offline check-off approach

1. **Optimistic local state** — `toggleCheck` flips `checked` in React state immediately (no wait on store `loading`).
2. **Persist in background** — live mode calls `useGroceryStore.getState().checkOff(id, next)` (SQLite via domain).
3. **Rollback on error** — restores prior `checked` and surfaces error text.
4. **Demo mode** — pure in-memory check state when no repository is active (web companion / preview).

Tap targets are ≥44px (checkbox circle 44×44, full-width row button). Safe-area padding on sticky header/footer.

---

## Trip handoff to M2

- Every list carries `shoppingTripId` from core `buildList` / `createGroceryList`.
- **End of trip** CTA: “Add N checked to pantry”.
- Writes one `purchase` relative txn per checked quantified line with  
  **`refId: shoppingTripId`** so a later receipt scan (M2 / track D) can reconcile instead of double-adding.
- Items without `ingredientId` / `formId` / `qtyBase` are skipped (still stay on list for visibility).
- Demo mode logs the intended handoff message without writing the ledger.

---

## Quick-item interaction cost

| Action | Taps |
|---|---|
| Eat yogurt / apple / 1 egg | **1** (primary tile button) |
| Eat 2 eggs | open stepper (+ already visible for count dims) → **2–3** total; default mult=1 so the common case stays one tap |
| Undo mis-tap | **1** (Undo in toast strip) |
| Pin / unpin | **1** (star) |

Pins + frequency live in `localStorage` (`tgp.quick.prefs.v1`) — no schema change (cannot edit `db/**`). Live mode commits `reason: 'quick'` negative deltas via `appendTxn`; undo is a compensating `adjust_delta` with `refId` = original clientTxnId.

Empty state when no pins. Loading / error states on both screens.

---

## Demo mode & screenshot

Web has no local SQLite. When `hasActiveRepository()` is false (or live build fails), the grocery screen builds a **fixture-aligned** list through core `buildList` (`demo-data.ts`) so designers and the screenshot are non-empty.

- Preview entry: `grocery-preview.html` + `src/grocery-preview-main.tsx`  
  (App.tsx is owned by another track — multipage vite input only)
- Script: `node apps/web/scripts/screenshot-grocery.mjs` → `reports/grocery-screen.png`

Screenshot shows aisle groups, source chips (Out + Recipe on ground beef → **3 lb**), reorder cadence callout, end-of-trip CTA.

---

## Layout (owned files)

```
apps/web/src/features/grocery/
  core-grocery.ts          # deep re-export of packages/core grocery
  build-sources.ts         # stock / reorder / recipe / manual → GrocerySource[]
  demo-data.ts             # track-G-shaped demo via buildList
  map-list.ts              # core lines ↔ DB item inputs; aisle groups
  source-labels.ts         # provenance chip copy + AA tones
  aisle-title.ts
  useGroceryScreen.ts      # controller (optimistic check-off, end trip)
  GroceryScreen.tsx
  GroceryLineRow.tsx
  SourceChips.tsx
  grocery.test.ts
  index.ts
apps/web/src/features/quick/
  prefs.ts / types.ts
  useQuickItems.ts
  QuickTile.tsx / QuickScreen.tsx
  quick.test.ts
  index.ts
apps/web/src/routes/GroceryPage.tsx
apps/web/src/routes/QuickAddPage.tsx
apps/web/grocery-preview.html
apps/web/src/grocery-preview-main.tsx
apps/web/scripts/screenshot-grocery.mjs
```

`vite.config.ts` multipage `input` for grocery-preview only (required for screenshot without App.tsx).

---

## Deviations

1. **App.tsx not wired** — brief forbids editing it. Routes exist as page components; shell integration is for the integration / home track. Preview multipage unblocks screenshot and manual QA.
2. **Quick pins in localStorage** — no `quick_items` table in schema; cannot edit db. Frequency is preference-layer, not ledger-derived globally (ledger only has per-ingredient `listTxnsForIngredient`).
3. **Deep imports** for grocery / recipes / seed — same pattern as track G seed loader and recipes track `core-imports.ts`. Root barrel still architect-owned.
4. **Reorder “one-tap add”** — overdue items are already merged into the list by `buildList`; the “On cadence” section surfaces the human copy. Adding a missing reorder injects a `reorder` source and rebuilds.
5. **Web demo stock** is a hand-maintained subset of fixtures (not a live DB fold) — only when repository is absent.

---

## Open questions

1. **Shell routes + FAB** — who wires `/grocery`, `/quick`, and the home FAB one-tap path into `App.tsx` / tab bar?
2. **Merge cook-preview grocery adds** — recipes track writes items via `groceryItemsFromPlan` without full `buildList`. Should cook → grocery always re-run track K’s builder so aggregation + trip id stay single-source?
3. **Persist quick pins** — promote localStorage prefs to a table once schema ownership allows?
4. **Rebuild policy** — currently rebuilds the whole list on refresh/manual add. Should check-off alone avoid rebuilding sources (already does — only toggles checked)?
5. **Export grocery from `@larder/core` root** — still open from m1-g; deep imports work but are fragile.

---

## Verification (ran)

```
npm run typecheck   # pass
npm run test        # core 248 + web 102
npm run build       # pass
node apps/web/scripts/screenshot-grocery.mjs  # reports/grocery-screen.png
```

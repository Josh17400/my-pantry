# M1 Track I — Pantry screens (list, item detail, locations)

**Date:** 2026-07-26  
**Scope:** `apps/web/src/features/pantry/**`, routes `PantryPage.tsx`, `PantryItemPage.tsx`, `LocationsPage.tsx`  
**Not touched (per brief):** `App.tsx`, `src/ui/**`, `src/state/**`, `src/db/**`, `packages/core/**`, home/recipes feature folders  
**Commits:** none

---

## Verification

| Command | Result |
|---|---|
| `npm run typecheck` | zero errors (core + web) |
| `npm run test` | **248** core + **102** web (includes **24** new pantry tests) — all green |
| `npm run build` | production build succeeds |
| Screenshot | `reports/pantry-screens.png` (390px list + detail stacked) |

---

## Screen inventory

| Screen | Route file | Feature | Purpose |
|---|---|---|---|
| Pantry list | `routes/PantryPage.tsx` | `PantryScreen` | Grouped list, search, filter, virtualized rows, FAB add |
| Item detail | `routes/PantryItemPage.tsx` | `PantryItemScreen` | Qty + provenance, meta edit, adjust/recount/waste/used-up, history |
| Locations | `routes/LocationsPage.tsx` | `LocationsScreen` | CRUD, one-level nesting, icon + tint |
| Add item | sheet on list | `AddItemSheet` | Catalog search → form/qty/location → `purchase` txn |

**Shell wiring:** `App.tsx` was off-limits. Routes export pages for the integration track. Until then, live UI review uses `pantry-preview.html` (mock fixture data, no DB).

---

## Recount vs adjust (how the user sees it)

| Action | Ledger | User copy |
|---|---|---|
| **Adjust** | `relative` / `adjust_delta` | *“Add or remove this much.”* Sheet title **Adjust quantity**. Explains it is **not** setting an exact total. |
| **Recount** | `absolute` / `recount` + `targetBase` | *“There is **exactly** this much.”* Sheet title **Recount**. Explains it **replaces** the previous total and re-verifies confidence. |
| **Mark used up** | absolute recount to `0` | Snaps empty and re-verifies (not a silent waste of remaining). |
| **Waste** | `relative` / `waste` (negative delta) | Partial throw-away amount. |

Detail footer reminder: **Adjust** = add/remove this much · **Recount** = there is exactly this much.

Both sheets use distinct tint callouts (sage for adjust, tan for recount) so the semantic difference is visual as well as textual.

---

## Virtualization choice

**Windowed virtualization** (not pagination).

- `VirtualList` renders only visible rows + overscan (~6).
- Fixed heights: location headers 40px, item rows 72px.
- Flattened location groups → `{ header | item }` rows so sticky section titles stay cheap.
- No new deps (`react-window` / FlashList not available on web without adding packages).

Chosen over “load more” pagination so search/filter over a full 500-item pantry stays one scroll surface.

---

## Provenance & precision

- Every quantity uses `formatQuantity` from `@larder/core` with **confidence-based `uncertaintyPct`** (verified 0 · drifting 8 · stale 20) so drifted numbers look drifted.
- `formatProvenanceLine` matches SPEC chips: `✓ receipt · 2 days ago` / `⚠ 3 cooks since verified` / `⚠ estimated · never verified`.
- Stock band from `evaluateStock` (never reimplemented). Status **text** via `StatusText`/`StatusBadge` (`low` token); never `low-fill` on text.

---

## Empty / loading / error

| Path | Behavior |
|---|---|
| No repository (web companion) | Empty state: “Pantry unavailable…” / data layer not connected |
| Loading first list | `LoadingBlock` pulse |
| Load error | `ErrorBlock` + **Try again** |
| Empty pantry (first run) | Dedicated empty state + **Add your first item** (not treated as edge case) |
| Filters/search miss | “No matches” + clear filters |
| Item missing | “Item not found” |
| History load fail | Inline error + retry |
| Locations empty | “No locations yet” + add CTA |

All write paths set `busy` on primary actions and surface parse errors inline.

---

## Undo

After adjust / recount / waste / mark used up / add:

1. Toast offers **Undo** for ~8s (`useUndoStack`).
2. Undo writes a **compensating txn** via `buildUndoTxn`:
   - relative → opposite `adjust_delta`
   - absolute → `recount` back to `previousQtyBase`

Ledger remains append-only; no row deletes.

---

## Locations

- Full CRUD through `useLocations()`.
- User-defined names (Garage Freezer, Office Drawer).
- **One-level nesting** enforced in UI (parent must be root; cannot nest under a child; cannot re-parent a parent that still has children).
- Icon picker + tint picker (decorative hex washes).

---

## Add item

1. Search **seed catalog** in-memory (`packages/core` seed — domain repo has no `listIngredients`).
2. Pick form + human quantity (`parseQuantity` / `convertToBase`) + location.
3. `upsert` placement metadata, then `appendTxn` **purchase**.

---

## Tests added (24)

| File | Covers |
|---|---|
| `provenance-display.test.ts` | age, provenance lines, quantity formatting |
| `filter-group.test.ts` | search, low/out/expiring, group/flatten |
| `txn-builders.test.ts` | adjust/recount/waste/used-up/purchase/undo |
| `qty-input.test.ts` | human qty + signed deltas |
| `stock-display.test.ts` | stock + near-expiry bands |

---

## Layout

```
apps/web/src/features/pantry/
  PantryScreen.tsx
  PantryItemScreen.tsx
  LocationsScreen.tsx
  preview-app.tsx              # screenshot harness
  components/                  # VirtualList, sheets, rows, undo, async
  hooks/useUndoStack.ts
  lib/                         # pure display/filter/txn/catalog helpers + tests
apps/web/src/routes/
  PantryPage.tsx
  PantryItemPage.tsx
  LocationsPage.tsx
apps/web/pantry-preview.html
apps/web/scripts/screenshot-pantry.mjs
```

---

## Deviations

1. **App routes not wired** — brief forbade editing `App.tsx`. Integration must mount `/pantry`, `/pantry/:ingredientId/:formId`, `/locations`.
2. **Catalog via seed deep-import** — same pattern as `db/seed.ts` (`packages/core/src/seed`); not on `@larder/core` root.
3. **Purchase history** uses `getDomainRepository().listTxnsForIngredient` (not on `usePantry()` surface).
4. **Mark used up** = absolute recount to 0 (verifying empty), not waste of remaining.
5. **Par edit** accepts base units in the form (g/ml/each), not human units — documented in the field label.
6. **Minimal cross-track type fixes** so the monorepo gate could pass while parallel tracks were mid-flight:
   - `features/grocery/build-sources.ts`: `planCook` arity (`servings` arg)
   - `routes/CookPage.tsx`: dead `phase === 'committing'` comparison after narrowing

---

## Open questions

1. When does the shell call `setActiveRepository` + `initialize({ loadFixtures: true })` for native? Screens already handle “no repo” gracefully.
2. Should verified provenance say “receipt” vs “recount” based on last verifying reason? Projection only stores timestamps + cook count today.
3. Multi-form stock per ingredient: detail history is per-ingredient ledger; list rows are per form — confirm UX if one ingredient has multiple forms.
4. Integration: tab bar + FAB ownership vs per-screen FAB on pantry list.

---

## Screenshot

`reports/pantry-screens.png` — list (grouped Fridge/Pantry, filters, provenance lines) and detail (qty, provenance, Adjust/Recount affordances) at **390px**, from fixture-backed preview (track G–style realistic items: milk expiring, flour with 3 cooks, olive oil never verified).

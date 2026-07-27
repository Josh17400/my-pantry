# Fix: manual Add item broken three ways

**Date:** 2026-07-27  
**Scope:** picker seed / default unit, `formatQuantity(0, count)`, pantry display name resolution  
**Not touched:** `supabase/**`, `native/**`, ledger semantics in `packages/core/src/pantry/`, no git commits

---

## Summary

| Fault | Cause | Fix |
|-------|--------|-----|
| 1 — Add wheel seeds at 0 | `seedPickerSelection('add', …)` returned `qty: 0` → submit blocked | Seed **first positive step** of the default unit |
| 2 — Count defaults to dozen | Zero scores all units equally; candidates list puts `dozen` first | Formatter: zero count → `"0 each"`; picker: `pickDefaultUnit(0, 'count') === 'each'` always |
| 3 — Row with no name | Display joined only to local `ingredients`; name from picker was **dropped** after toast | Denormalize name on write (web), ensure catalogue row exists, seed-catalog fallback in display |

---

## Fault 1 — zero seed blocks submit

**Before:** Add sheet seeded `{ qty: 0, unit: … }`. `AddItemSheet.submit()` hit `qtyBase <= 0` and showed *"Quantity must be greater than zero"* under the fold. First tap of **Add to pantry** did nothing visible.

**After:** `mode: 'add'` seeds `firstPositiveStep(unit)` — for `each` that is `1`. Adjust / waste still seed at 0; recount still seeds from stock.

**Files:** `apps/web/src/features/pantry/lib/picker-wheels.ts` (`firstPositiveStep`, `seedPickerSelection`)

---

## Fault 2 — dozen at zero corrupts inventory

**Before (confirmed):**

```
formatQuantity(0, 'count')  === "0 dozen"
pickDefaultUnit(0, 'count') === "dozen"
// dial 1 → "Adding 1 dozen of Cucumber" → qtyBase: 12
```

At zero every unit gets `readabilityScore === 1000`. List order (`dozen` before `each`) decided the tie.

**After:**

1. **`formatQuantity`** — special-case count at ~0 → always `"0 each"` (mass/volume at zero still land on deliberate US retail list winners: `lb` / `cup`).
2. **`pickDefaultUnit`** — for count with non-positive stock, **always** return `'each'`, independent of the formatter.

**Files:**  
- `packages/core/src/units/format.ts`  
- `apps/web/src/features/pantry/lib/picker-wheels.ts`

---

## Fault 3 — nameless pantry row + “French”

### What was broken

`AddItemSheet` passed `ingredientName: picked.name` into `onConfirm`, but `PantryScreen.handleAdd` only used that string for the undo toast. IndexedDB / projection rows had **no** name field. List UI did:

```
ingredientName: ing?.name ?? item.ingredientId
```

then `resolvePantryItemDisplayName` treated raw-id fallbacks as **"Unknown item"** (owner: “one each” with no title).

Manual-add **search** uses the in-memory seed catalog; **display** joins the local `ingredients` table. Those only re-upsert when `SEED_VERSION` changes (`1.1.0` today). An install whose meta already said a prior version was “current” while the binary gained new ids (or a wiped/partial ingredients store) could store a pantry row whose join missed.

### Fixes (layered)

1. **Persist name on write (web / IndexedDB):** `PantryItemUpsert.ingredientName` + `PantryItemRec.ingredientName`; `handleAdd` passes it; `recomputeProjection` preserves it.
2. **Ensure catalogue rows on upsert:** if the local `ingredients` / forms row is missing, insert from seed (or the display name). Applied in both `DevDomainRepository` and `DomainRepository`.
3. **Display fallback:** `resolveIngredientTitle` / `resolvePantryItemDisplayName` — join name → denormalized name → **seed catalog by id** → `"Unknown item"`.

**Files:**  
- `apps/web/src/db/ingredient-display.ts` (new)  
- `apps/web/src/db/types.ts`, `drivers/dev-store.ts`, `drivers/dev.ts`, `domain-repository.ts`  
- `apps/web/src/features/pantry/PantryScreen.tsx`  
- `apps/web/src/features/pantry/components/PantryItemRow.tsx`

### “French”

**Cannot happen on the cucumber manual-add path.** Codebase grep for “French” / “french” product copy finds only:

- Seed: `frozen-fries` → name `"Frozen french fries"`, aliases `FRENCH FRIES` / `FROZEN FRIES` / `FRIES` (`packages/core/src/seed/categories/frozen.ts`)
- Matching stopword: `'french'` in `packages/core/src/matching/normalize.ts` (receipt/OCR token strip — not used by manual catalog search)

Playwright repro for query `"cucumber"` returns only **Cucumber**. Search scoring is name / id / alias include; neither id nor aliases of `frozen-fries` contain `cucumber`. Quantity formatting never emits “French”. Provenance copy is “purchased … ago”, which matches the owner’s “purchased 11 minutes ago one each” for the **quantity line**, not the title.

Plausible non-code explanations: misremembered a different item (fries already in freezer), conflated two rows, or speech-to-text of the report. **No code path maps a cucumber add to the french-fries string.**

---

## Repro before / after

Command: `node apps/web/scripts/repro-add-cucumber.mjs`

| | Before (brief) | After |
|--|----------------|-------|
| Submit | `!! submit error: ["Quantity must be greater than zero"]` | no alert |
| Preview (after dialing 1) | `Adding 1 dozen of Cucumber` | `Adding 1 each of Cucumber` |
| Stored | `[]` or `qtyBase: 12` | `qtyBase: 1`, `dim: count`, `ingredientName: "Cucumber"` |
| Rendered row | missing / wrong | `…Cucumber1 each…` |

Repro script now exits non-zero if those gates fail.

---

## Regression tests

- `seedPickerSelection('add', 'count', 0)` → qty `1`, unit `each`, submittable  
- `formatQuantity(0, 'count')` === `"0 each"`  
- `pickDefaultUnit(0, 'count')` === `'each'`  
- Missing local catalogue / raw-id name → still resolves **Cucumber** via seed  
- PantryItemRow / ingredient-display coverage updated for seed fallback  

---

## Verification (this session)

```
npm run typecheck   # pass
npm run lint        # pass
npm run test
  @larder/core  →  30 files, 315 tests passed
  @larder/web   →  29 files, 333 tests passed
npm run build       # pass (vite production)
node apps/web/scripts/repro-add-cucumber.mjs
  → OK: cucumber stored at qtyBase 1 count and rendered as Cucumber 1 each
```

---

## Adjacent / out of scope (not fixed)

1. **SQLite `pantry_items` has no denormalized name column.** Native path relies on ensure-catalogue-on-upsert + seed display fallback, not a stored column. A future migration could mirror the web IndexedDB field if offline custom names matter.
2. **Zero still dialable on Add** after seed; if the user spins back to 0, submit still errors. Error text remains below the fold — primary fix is a valid default.
3. **Repro text dump glues name+category** (`"Cucumberproduce"`) — separate spans in the search result row; not a product bug.
4. **`formatQuantity` dual-scan loop** in `format.ts` still has redundant best-unit selection; unchanged, works, not part of this brief.
5. **Owner “French” report** — no fix path; see finding above.

# Fix cook flow + real substitution handling

**Date:** 2026-07-26  
**Scope:** `apps/web/src/features/recipes/**`, `apps/web/src/routes/CookPage.tsx`, `apps/web/scripts/verify-interactivity.mjs`  
**Also (1 line, continuity):** `apps/web/src/features/cooking/CookingModeScreen.tsx` appends `from=cooking` on exit to preview.

---

## 1. Confirm visibility — what was wrong and how the hit test proves it

### Root cause (architect fix, verified)

`CookPage`'s confirm bar is `fixed bottom-0`. The shell tab bar is also `fixed bottom-0` and appears later in the DOM, so it painted on top of **Confirm cook**. The button was in the DOM but unreachable — a pure presence check would pass.

### Current routing

`App.tsx` already renders `/recipes/:id/cook` **outside** `AppShell` (same pattern as cooking mode). This brief verified that path; it was not re-architected.

### Hit test (new, in `verify-interactivity.mjs`)

```js
elementFromPoint(buttonCentreX, buttonCentreY)
// must be the button or a descendant — not the tab bar
```

E2E result (390×844 viewport):

| Check | Result |
|---|---|
| Confirm cook centre | `(195, 770)` |
| `elementFromPoint` | hits the button |
| After click | success state |

Without a real hit test, the original dead-end would still look “green.”

---

## 2. Substitution model — what gets deducted

| User action | UI | Deducted on confirm | Cook event provenance |
|---|---|---|---|
| **No substitution** | Default line amount / skip | Original ingredient + form (`deltaBase = −actualUsedBase`) | Standard cook txns under `cookEventId` |
| **Pantry substitute** | Picker → pantry row | **Substitute** ingredient + form only. Original is skipped. Amount from `convert()` when possible; otherwise user enters amount (never guessed). | Same `cookEventId`; `clientTxnId` tagged `…:sub:…` |
| **Other** (top of picker) | Free text | **Nothing** | Note on the line / grocery notes; UI says **“noted, nothing deducted”** |
| **Clear substitute** | Clears selection | Restores original default deduction | — |

### Implementation pieces

- `cook-machine.ts` — `PantrySubstitution` / `OtherSubstitution`, `setLinePantrySubstitution`, `setLineOtherSubstitution`, `clearLineSubstitution`; `buildCookTxns` branches on sub kind; negative-stock check uses **substitute** `haveBase`.
- `substitution.ts` — rank pantry (same category → in stock → rest), `buildPantrySubstitution` via `@larder/core` `convert()` + `BASE_UNIT`.
- `SubstitutionPicker.tsx` — full-screen mobile picker; **Other** fixed at top; search; qty + location.
- `CookPreviewLine.tsx` — Substitute / Change / Clear; status cards for pantry vs other.
- Confirm summary block on `CookPage` lists every sub before commit.

### Domain gap

None required. Conversion already fails closed; UI asks for amount when `convert()` returns `ok: false`.

---

## 3. Cook flow polish

| Issue | Fix |
|---|---|
| No way out | **← Recipe** in header at every phase; **Cancel · back to recipe** under confirm; **Done → recipe** after success/undo |
| Stranded after confirm | Success card (`Cook logged`, `cookEventId`, committed list) + fixed bar: **Undo** + **Done → recipe** |
| Steps ↔ preview disconnect | Cooking mode exits with `?from=cooking`; preview header becomes **“Steps done · review deductions”** and explains continuity |
| Outside shell | Full-screen `min-h-screen bg-bg` so confirm/done bars are never under the tab bar |

---

## 4. E2E walk — before / after quantities

Recipe: **Black Bean Tacos** (`fixture-recipe-black-bean-tacos`), 4 servings.  
Ingredient: **Black beans (canned)** (`beans-black` / `beans-black-bulk`).

| Step | Display qty | ~base mass |
|---|---|---|
| **Before cook** | `0.937 lb` | **~425 g** (fixture stock) |
| **After confirm** | `0 lb` | **0 g** (need 425 g fully consumed) |
| **After undo** | `0.94 lb` | **~425 g** (display re-round; base within 5 g of before) |

Also asserted:

- Confirm cook **hit-test clickable** (not merely in DOM)
- Success: **Cook logged**, `cookEventId`, **Undo** control
- Undo → **undone** status + qty restored

`cookEventId` example from last green run: `cook_5ffa1930-edcb-42b5-8b0f-66b49f43a62e`

---

## 5. General bottom-control hit tests — findings

| Route | Result |
|---|---|
| home, pantry, recipes, grocery, quick | No fixed bottom CTAs in lower third, or clear |
| **cook-preview** | Confirm cook **clickable** (hard pass) |
| **recipe-detail** | **FIND:** “Log cook (skip steps)” **obscured by tab bar** (`rectBottom=844`, `tabTop=787`) |

### Recipe detail debt (out of this brief’s edit scope)

`RecipeDetailPage` still uses a `fixed bottom-0` bar **inside** `AppShell`. Same bug class as cook preview. Soft-reported in the suite (FIND, not hard fail for non-cook routes). Fix later by lifting detail CTAs above the tab bar (padding / portal / outside-shell) the same way cook was fixed.

The E2E walk falls back to the cook URL when Log cook is unclickable, so the **deduct path** is still proven.

---

## 6. Verification

```
packages/core:  279 tests passed
apps/web:       238 tests passed  (was 234; +4 substitution unit tests)
typecheck:      clean
lint:           clean
build:          clean
node scripts/verify-interactivity.mjs:  all interactivity checks passed
```

Script notes:

- Runs **Vite DEV** (not preview) so demo fixtures seed — production builds intentionally skip fixtures.
- Port **4327** to avoid colliding with a leftover preview on 4321.
- Cook walk + bottom hit tests are permanent companions to the older navigation/overflow checks.

---

## Files touched

| File | Role |
|---|---|
| `features/recipes/cook-machine.ts` | Substitution state + txn/negative logic |
| `features/recipes/cook-machine.test.ts` | 4 substitution cases |
| `features/recipes/substitution.ts` | Rank + convert helpers |
| `features/recipes/SubstitutionPicker.tsx` | Pantry / Other picker UI |
| `features/recipes/CookPreviewLine.tsx` | Substitute UX |
| `features/recipes/NegativeStockPrompt.tsx` | Shows via-substitute labels |
| `features/recipes/grocery-from-plan.ts` | Sub notes on grocery lines |
| `features/recipes/index.ts` | Exports |
| `routes/CookPage.tsx` | Wire picker, summary, done bar, back, continuity |
| `features/cooking/CookingModeScreen.tsx` | `from=cooking` query (1 line) |
| `scripts/verify-interactivity.mjs` | Cook E2E + hit tests |

No commits created. `packages/core` untouched.

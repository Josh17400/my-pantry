# M2 Track C — Barcode lookup and cooking mode

**Date:** 2026-07-26  
**Owner paths:** `apps/web/src/features/barcode/**`, `apps/web/src/features/cooking/**`,  
`apps/web/src/routes/BarcodePage.tsx`, `apps/web/src/routes/CookingModePage.tsx`

---

## Summary

Shipped put-away barcode flow (Open Food Facts → catalog match → purchase) and a full-screen cooking mode (one step at a time, concurrent timers, no ads). Both degrade on web without native plugins.

| Surface | Route |
|--------|--------|
| Barcode put-away | `/barcode` |
| Cooking mode | `/recipes/:id/cooking?servings=N` (`?demo=1` for offline review) |
| Exit from cooking | `/recipes/:id/cook?servings=N` (existing deduct preview) |

Screenshot: `reports/cooking-mode.png` (390×844).

---

## Part 1 — Open Food Facts integration

### Resolution flow

1. Scan UPC/EAN (native plugin / `BarcodeDetector` / manual entry).
2. If a **remembered user mapping** exists → skip OFF, go to confirm.
3. Else **local OFF cache** hit → no network, no rate-limit spend.
4. Else **OFF product API** (`/api/v2/product/{code}.json`) with custom User-Agent.
5. Map name/brand → `matchIngredient` against **seed catalog only** (`path: 'receipt'`).
6. User confirms ingredient + qty → `purchase` txn via pantry store + save mapping.

### Segregation and attribution (licensing — precise)

Open Food Facts is **ODbL share-alike**. Folding OFF fields into our proprietary seed/matching database can attach share-alike to the derivative. Therefore:

| Layer | What it is | What it is not |
|-------|------------|----------------|
| `OffDerivedProduct` | Tagged `source: 'open-food-facts'`; name, brand, quantity label, OFF URL, attribution strings | Never written into seed `Ingredient` rows |
| `BarcodeOffCache` | localStorage key `tgp.off-barcode-cache.v1`; only accepts `isOffSourced` rows | Not the catalog |
| `BarcodeCanonicalMapping` | User-confirmed `barcode → ingredientId + formId` (our ids) | Optional `offRef` is a pointer only (barcode + productName), not merged fields |
| Purchase txn | Relative `reason: 'purchase'` on **canonical** ingredient/form ids | No OFF payload on the ledger |

**Rules enforced in code** (`segregation.ts`, `cache.ts`, tests):

1. Every OFF row carries `source: 'open-food-facts'` and the full attribution line.
2. `mapOffApiToDerived` produces only `OffDerivedProduct` — no seed id, no `defaultFormId`.
3. Cache `set()` throws if the row is not OFF-sourced.
4. `matchIngredient` runs against `buildSeedMatchCatalog()` (seed ingredients + seed aliases only).
5. Put-away confirmation writes a **purchase** against our ids and a **user mapping** — not an OFF-augmented ingredient.

**In-app attribution:** barcode screen footer (`data-testid="off-attribution"`) ships:

> Product data © Open Food Facts contributors, ODbL. https://openfoodfacts.org

Plus explicit copy that OFF-derived rows stay segregated and are never merged into the ingredient seed. (Settings/about can re-export `OFF_ATTRIBUTION_LINE` from the feature barrel when a settings page exists.)

### Rate limiting

- OFF limit: **15 product reads / minute / IP**.
- Client sliding window: `OffRateLimiter` / `checkRateLimit` (`rate-limit.ts`).
- Cache hits **do not** call the network and **do not** consume a slot.
- On limit: polite error with `retryAfterMs`; no hammering.
- User-Agent:  
  `TheGoodPantry/1.0 (https://github.com/thegoodpantry; pantry-app; barcode-lookup)`

### Scanner degradation (web)

| Environment | Behavior |
|-------------|----------|
| Capacitor native | `registerPlugin('BarcodeScanner')` — community or ML Kit style APIs; permission check; catch missing plugin |
| Web + `BarcodeDetector` | Optional camera stream + frame detect; manual always available |
| Web without detector | Manual UPC/EAN entry only; clear copy, no crash |

---

## Part 2 — Cooking mode

### Interaction model

- **Full-screen** route (no tab bar / FAB shell) — kitchen use, arm’s-length.
- Large step copy (`~1.65rem` display), high-contrast surface card.
- One step at a time; **Back** / **Next** targets ≥56px height.
- Scaled ingredient checklist (token match into step text; fallback = full scaled list).
- Servings stepper in header (optional).
- **Exit** / **Finish → log cook** navigates to existing `/recipes/:id/cook` — does **not** reimplement `planCook` / commit.
- `prefers-reduced-motion`: no decorative transitions.
- Recipe detail CTA: **Start cooking** (steps) + **Log cook (skip steps)** (preview only).

### Timers

Pure state machine (`timers.ts`):

- `idle → running → paused → running → finished`
- Multiple concurrent timers (e.g. pasta + sauce)
- Start / pause / resume; `tickTimers` every 250ms
- On finish: Notification API when granted, else document title flash
- Step with `durationSec` auto-registers a timer for that step

### Keep-awake

- Native: Capacitor `KeepAwake` plugin via `registerPlugin` (no hard dep — fails soft).
- Web: Screen Wake Lock API when available; else no-op.
- Released on unmount.

### No ads

- `COOKING_MODE_POLICY.adsAllowed === false`
- `data-ads-allowed="false"` on root; **no** `AdSlot` import/render
- Route shell omits product chrome that might host feed ads
- Tests assert source files never mention `AdSlot`; browser smoke counts `data-ad-slot` = 0

---

## Tests added

| Area | File |
|------|------|
| OFF → mapping, segregation, UA | `features/barcode/barcode.test.ts` |
| Rate limit throttle | same |
| Cache hits (no fetch) | same |
| Timer transitions + concurrent | `features/cooking/cooking.test.ts` |
| AdSlot absent + policy | same |
| Checklist scaling | same |

**Results (this track’s verification):**

- `@larder/core`: **248** tests passed  
- `@larder/web`: **153** tests passed (prior ~134 + **19** new)  
- `vite build` (apps/web): **success**  
- Browser smoke: cooking mode + barcode render; `reports/cooking-mode.png` written  

### Typecheck note (parallel track)

`npm run typecheck` / `npm run build` (which runs `tsc --noEmit` first) currently fail on **`apps/web/src/features/receipt/**`** (Track A/B): missing `@capacitor/camera` types and `parse-client.ts` assignability errors. **No errors under `features/barcode` or `features/cooking`.** Receipt is out of this track’s ownership; do not treat as a C regression.

---

## Deviations

1. **Capacitor plugins** not added as npm deps — used `registerPlugin` + optional browser APIs so web review never hard-depends on native packages. Real device builds should still install `@capacitor/keep-awake` and a barcode plugin and register them in the native projects.
2. **Step ↔ ingredient linkage** is heuristic (token overlap with step text), not structured step-ingredient ids (not in the recipe model yet).
3. **Default put-away qty** is `1` base unit when package size is unknown — user edits before confirm.
4. **Settings/about page** does not exist yet; OFF credit ships on the barcode screen (and is exportable for a future about screen).
5. **RecipeDetailPage** bottom actions adjusted for cooking entry (shared route ownership with recipes UI).

---

## Open questions

1. Legal: is segregated cache + mapping-only storage sufficient under ODbL for production, or should barcode be cut pending counsel? (SPEC already flags this.)
2. Should remembered barcode mappings sync across household devices (today: localStorage only)?
3. Native plugin choice: community barcode scanner vs ML Kit — install and wire in `native/` when device QA starts.
4. Should cooking mode auto-advance on timer finish, or only notify?
5. When monorepo typecheck is green again (receipt track fixed), re-run full `npm run typecheck && npm run build` gate.

---

## File inventory

```
apps/web/src/features/barcode/
  attribution.ts, rate-limit.ts, types.ts, segregation.ts, cache.ts,
  user-mappings.ts, match-catalog.ts, match-product.ts, off-client.ts,
  scanner.ts, put-away.ts, BarcodeScreen.tsx, index.ts, barcode.test.ts
apps/web/src/features/cooking/
  policy.ts, timers.ts, keep-awake.ts, step-ingredients.ts, demo-recipe.ts,
  notify.ts, CookingModeScreen.tsx, index.ts, cooking.test.ts
apps/web/src/routes/BarcodePage.tsx
apps/web/src/routes/CookingModePage.tsx
apps/web/scripts/screenshot-cooking-mode.mjs
reports/cooking-mode.png
reports/m2-c-barcode-cooking.md
```

# M1 Track E — Canonical ingredient seed data

**Status:** complete  
**Scope:** `packages/core/src/seed/**`, `packages/core/test/seed/**` only  
**Verification:** `npm run typecheck` (workspace) zero errors; `npm run test` **248 passed** (pre-existing suite + 29 seed tests). Did not edit `src/index.ts` or other tracks.

## Summary

| Metric | Count |
|--------|------:|
| Ingredients | **363** |
| Forms | 375 |
| Conversion edges | 12 |
| Package specs | 439 |
| `validateSeed` issues on ship | 0 |

Target was ~300; landed at 363 with weekly-US-kitchen weight (produce, dairy, staples, spices). Slightly above “~300” is intentional coverage, not encyclopedia bloat.

## Ingredient count by category

| Category | Count |
|----------|------:|
| produce | 55 |
| dairy | 29 |
| meat-seafood | 32 |
| grains-pasta | 28 |
| pantry-staples | 29 |
| canned | 29 |
| baking | 30 |
| spices-herbs | 43 |
| condiments | 32 |
| oils-vinegars | 13 |
| frozen | 16 |
| beverages | 15 |
| baby-household | 12 |
| **total** | **363** |

## Layout

```
packages/core/src/seed/
  types.ts          SeedIngredient, SeedCatalog, validation issue types
  helpers.ts        ingredient/form/edge/pack builders + mergeBundles
  sources.ts        density citations + KNOWN_DENSITIES constants
  validate.ts       validateSeed() + undirectedEdgeKey / normalizeAlias
  index.ts          barrel → seedCatalog, SEED_CATEGORIES, assertSeedValid
  categories/       one file per grocery aisle
packages/core/test/seed/
  validate.test.ts  catalog integrity + rule unit tests
  conversions.test.ts  cup/stick/egg spot-checks via convert()
```

Domain shapes (`Ingredient`, `IngredientForm`, `ConversionEdge`, `PackageSpec`) are **imported** from `domain/`. Aliases are seed-only (`SeedIngredient = Ingredient & { aliases }`) so matching can consume them without changing the domain type.

## Multi-form models (and why)

| Ingredient | Forms | Why |
|------------|-------|-----|
| **Garlic** | whole bulb, clove, minced (vol), powder | Recipes mix count cloves, jarred minced, and powder; powder→fresh is **oneWay** (lossy flavor sub). |
| **Onion (yellow)** | whole, chopped | Whole is how you buy; chopped is how recipes measure cups. |
| **Cilantro** | bunch, chopped, dried | Bunch weight is store/season chaos; dried→fresh leaves **oneWay**. |
| **Butter** | stick, tbsp (vol), bulk mass | US stick is the stocking unit; recipes use tbsp; bulk for leftover mass. |
| **Cheddar** | block, shredded | Same mass 1:1; shredded carries volume density for cup measures (high uncertainty). |
| **Parmesan** | block, grated, shredded | Grated is default (recipe + shaker can); density ~0.38 g/ml for cups. |
| **Egg** | whole (count) | dozen package; 50 g/each. |
| **Milk (whole)** | liquid | gallon / half-gal / quart packages via density. |
| **Whole chicken** | whole → boneless-yield | USDA ~67% yield; **oneWay** (cannot invent bones by reverse). |

Most of the long tail is single-form mass/volume/count with retail `PackageSpec`s for par seeding (14.5 oz diced tomatoes + `drainedG`, gallon milk, 5 lb flour, dozen eggs, 8 oz cheese block, etc.).

## Density sources

Documented in `src/seed/sources.ts` (`DENSITY_SOURCES`, `KNOWN_DENSITIES`):

| Tag | Use |
|-----|-----|
| **usda** | FoodData Central / SR Legacy densities and produce piece weights (egg 50 g edible, garlic clove ~3 g, honey ~1.42 g/ml, oils ~0.91–0.92, milk ~1.03, table salt ~1.217). |
| **king_arthur** | Cup→g for baking staples (AP flour 120 g/cup, sugar 200 g/cup, brown sugar packed 213 g/cup, powdered 113 g/cup, oats, cornstarch, almond flour). Converted to g/ml with US cup **236.5882365 ml** (matches `units/factors.ts`). |
| **us_dairy** | Butter stick = 1/4 lb = **113.398 g**. |
| **physical** | Water 1.0 g/ml; unit definitions. |
| **retail_label** | Canned drained weights (e.g. 14.5 oz diced tomatoes `drainedG` ~10 oz) — variable by brand. |
| **kitchen_avg** | Bulb garlic, medium onion, herb bunches — intentionally high `uncertaintyPct`. |
| **culinary** | Cross-checked kitchen consensus (minced garlic volume, grated cheese packing) where USDA lacks cup form. |

**Policy:** Do not invent “plausible” densities. Prefer omit volume density on pure mass stock items; when a cup weight is needed, cite KA/USDA; when variable, raise uncertainty rather than fake precision.

### High-uncertainty values (flagged)

| Item | uncertaintyPct | Reasoning |
|------|---------------:|-----------|
| Cilantro bunch / chopped | 50–60% | Bunch wet weight 20–80 g by store/season. |
| Fresh herb clamshells (basil, mint, thyme…) | 50% | Package fill varies widely. |
| Garlic bulb→cloves, clove→minced | 30–35% | Cultivar size. |
| Garlic clove→powder (oneWay) | 50% | Flavor sub, not mass-equivalent. |
| Shredded cheese densities | 25% | Packing density dominates cup weight. |
| Grated Parmesan density | 20% | Settling / brand. |
| Onion whole | 30% | “Medium” is marketing, not metrology. |
| Watermelon whole | 40% | 5–15+ lb range. |
| Kosher salt density | 20% | Diamond Crystal vs Morton crystal size (~2× by volume). |
| Dried leaf herbs | 25–30% | Fluffiness. |
| Saffron | 40% | Trace threads. |
| Ice cream | 25% | Overrun (air) by brand. |
| Cooking spray “net” | 25% | Propellant vs oil mass. |
| Canned drainedG | (package field) | Brand-dependent; retail_label only. |

## Allergen tagging policy

- **US FALCPA + sesame** only (`Allergen` from `domain/allergens.ts`).
- **Under-tagging is a safety failure; over-tagging is annoyance.** Conservative defaults:
  - Soy sauce → `wheat` + `soy`
  - Worcestershire, fish sauce, Caesar dressing, anchovy → `fish`
  - Oyster sauce → `shellfish` (+ wheat/soy as typical)
  - Chocolate chips → `milk` + `soy` (lecithin)
  - Flour / pasta / most breads → `wheat`
  - Mayo → `egg`
  - Peanut butter / peanut oil → `peanut`
  - Tree-nut butters, milks, flours, coconut (FDA tree-nut) → `tree_nut`
  - Sesame oil, tahini, hummus, everything bagel → `sesame`
  - Taco seasoning packets → `wheat` + `soy` (common fillers)
  - Vegetable oil / cooking spray → `soy` (soybean oil common)
- **Judgment calls / unsure:**
  - **Barley:** contains gluten but is not FALCPA “wheat”. Left **untagged** rather than lie with `wheat`. Open: add a future non-FALCPA gluten flag?
  - **Yeast / pure cocoa / pure oats cereal:** no major allergen tags (facility cross-contact is brand-specific).
  - **Oat milk:** no wheat tag (many US brands are certified GF; contaminated brands should be user-corrected).
  - **Tamari:** `soy` only (traditional wheat-free); some brands add wheat — open question for brand-level data.
  - **Mayo:** egg only; refined soy oil often labeling-exempt — did not tag soy.
  - **Coconut / coconut milk / oil:** tagged `tree_nut` per FDA classification (debated nutritionally; liability-safe).
  - **Ice cream base:** `milk` only; flavor inclusions (nuts, cookie dough wheat) are not modeled.

## What `validateSeed()` enforces

1. Unique ingredient ids; unique form ids  
2. Every ingredient has ≥1 form; `defaultFormId` exists and belongs to that ingredient  
3. Forms: volume requires `densityGPerMl`; count requires `gramsPerCount`; finite positive fields  
4. Density band **0.1–2.0 g/ml** (catches unit slips / typos)  
5. Allergens ∈ closed `ALLERGENS` set  
6. Edges reference existing forms; no cross-ingredient edges; factor > 0  
7. **No duplicate-direction edges** (undirected pair key) — `convert()` auto-inverts non-`oneWay` edges  
8. Alias collision across different ingredients (normalized lower/trim/collapse space), including name and id-derived keys  
9. Packages reference real forms; `netG` > 0; `drainedG` ≤ `netG` when present  

Shipped catalog is asserted in tests; negative cases for each major rule are unit-tested.

## Spot-check conversions (via `convert()`, not reimplemented)

| Check | Result |
|-------|--------|
| 1 cup granulated sugar | ≈ 200 g |
| 1 cup AP flour | ≈ 120 g |
| 1 large egg | 50 g |
| 1 stick butter | 113.398 g |
| 1 gal whole milk | ~3900 g |
| 1 cup olive oil | ~215 g |

## Open questions (do not guess)

1. **Brand-level allergen variance** (tamari with wheat, “vegetable oil” non-soy, mayo with soy) — seed is SKU-generic; should M2 receipts attach brand allergen overrides?  
2. **Gluten beyond wheat** (barley, rye) — no domain tag today.  
3. **Garlic powder** exists both as form of `garlic` and as spice-aisle `garlic-powder` ingredient — intentional for stocking path; matching must not auto-merge without user intent.  
4. **Drained weight** genericity for all canned goods — only major items have `drainedG`; others need label-specific data later.  
5. **Architect wiring:** seed is not re-exported from `packages/core/src/index.ts` (per brief). Confirm export surface when integrating matching/par.  
6. **Produce “medium” piece weights** — USDA medium is used where available; user recount remains the truth for high-churn produce.  
7. **Honey density 1.42 vs FDC cup weight ~1.43** — within uncertainty; fine for inventory, not lab work.

## Verification commands (ran)

```
npm run typecheck   # core + mobile: zero errors
npm run test        # 248/248 passed
```

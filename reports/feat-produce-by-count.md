# Feature: Large produce counted, not weighed

**Date:** 2026-07-27  
**Scope:** `packages/core/src/seed/**` + seed tests only  
**SEED_VERSION:** `1.0.0` → **`1.1.0`**

## Summary

Hand-sized produce now defaults to a **count** form with documented `gramsPerCount`. Scoopable berries/grapes stay **mass**. Herbs, celery, kale, and asparagus default to **bunch** with honest high uncertainty. Every count-default item keeps a **mass bulk form** (and a conversion edge) so bag/receipt pounds still resolve and existing pantry rows that reference `*-bulk` are not stranded.

Conversion machinery (`packages/core/src/units/**`) was not touched — it already supports count↔mass via `gramsPerCount` and form-graph edges.

---

## Classification table

| Ingredient id | Name | Class | Default form | dim | gramsPerCount | unc% |
|---|---|---|---|---|---|---|
| apple | Apple | **count** | `apple-each` | count | 182 | 25 |
| banana | Banana | **count** | `banana-each` | count | 118 | 20 |
| orange | Orange | **count** | `orange-each` | count | 131 | 20 |
| lemon | Lemon | **count** | `lemon-each` | count | 84 | 20 |
| lime | Lime | **count** | `lime-each` | count | 67 | 20 |
| peach | Peach | **count** *(added)* | `peach-each` | count | 150 | 25 |
| pear | Pear | **count** *(added)* | `pear-each` | count | 178 | 25 |
| mango | Mango | **count** | `mango-each` | count | 200 | 35 |
| pineapple | Pineapple | **count** | `pineapple-whole` | count | 900 | 35 |
| watermelon | Watermelon | **count** | `watermelon-each` | count | 9000 | 40 |
| tomato | Tomato | **count** | `tomato-each` | count | 123 | 25 |
| tomato-roma | Roma tomato | **count** | `tomato-roma-each` | count | 62 | 25 |
| tomato-cherry | Cherry tomato | **mass** | `tomato-cherry-bulk` | mass | — | — |
| onion | Onion (yellow) | **count** | `onion-whole` | count | 110 | 25 |
| onion-red | Red onion | **count** | `onion-red-each` | count | 110 | 25 |
| onion-green | Green onion | **count** | `onion-green-stalk` | count | 15 | 40 |
| shallot | Shallot | **count** | `shallot-each` | count | 40 | 35 |
| garlic | Garlic | **count** (clove) | `garlic-clove` | count | 3 | 30 |
| potato-russet | Russet potato | **count** | `potato-russet-whole` | count | 173 | 30 |
| potato-red | Red potato | **count** | `potato-red-whole` | count | 150 | 35 |
| potato-yukon | Yukon gold | **count** | `potato-yukon-whole` | count | 150 | 35 |
| sweet-potato | Sweet potato | **count** | `sweet-potato-whole` | count | 130 | 30 |
| carrot | Carrot | **count** ⚠ | `carrot-whole` | count | 61 | 30 |
| ginger-root | Ginger root | **count** | `ginger-root-knob` | count | 30 | 40 |
| avocado | Avocado | **count** | `avocado-each` | count | 170 | 25 |
| bell-pepper-green | Green bell pepper | **count** | `bell-pepper-green-each` | count | 119 | 20 |
| bell-pepper-red | Red bell pepper | **count** | `bell-pepper-red-each` | count | 119 | 20 |
| bell-pepper-yellow | Yellow bell pepper | **count** | `bell-pepper-yellow-each` | count | 119 | 20 |
| jalapeno | Jalapeño | **count** | `jalapeno-each` | count | 14 | 30 |
| cucumber | Cucumber | **count** | `cucumber-each` | count | 301 | 25 |
| zucchini | Zucchini | **count** | `zucchini-each` | count | 196 | 25 |
| yellow-squash | Yellow squash | **count** | `yellow-squash-each` | count | 196 | 25 |
| eggplant | Eggplant | **count** *(added)* | `eggplant-each` | count | 548 | 35 |
| corn-ear | Corn on the cob | **count** | `corn-ear-ear` | count | 150 | 30 |
| lettuce-romaine | Romaine | **count** (head) | `lettuce-romaine-head` | count | 300 | 35 |
| lettuce-iceberg | Iceberg | **count** (head) | `lettuce-iceberg-head` | count | 539 | 25 |
| cabbage | Cabbage | **count** (head) | `cabbage-head` | count | 908 | 30 |
| broccoli | Broccoli | **count** (head/crown) | `broccoli-head` | count | 250 | 35 |
| cauliflower | Cauliflower | **count** (head) | `cauliflower-head` | count | 588 | 30 |
| blueberry | Blueberries | **mass** | bulk | mass | — | — |
| strawberry | Strawberries | **mass** | bulk | mass | — | — |
| raspberry | Raspberries | **mass** *(added)* | bulk | mass | — | — |
| blackberry | Blackberries | **mass** *(added)* | bulk | mass | — | — |
| grape | Grapes | **mass** | bulk | mass | — | — |
| spinach | Spinach | **mass** | bulk | mass | — | — |
| arugula | Arugula | **mass** | bulk | mass | — | — |
| green-beans | Green beans | **mass** | bulk | mass | — | — |
| peas-fresh | Peas (fresh) | **mass** *(added)* | bulk | mass | — | — |
| brussels-sprouts | Brussels sprouts | **mass** | bulk | mass | — | — |
| mushroom-white | White mushrooms | **mass** ⚠ | bulk | mass | — | — |
| mushroom-baby-bella | Baby bellas | **mass** ⚠ | bulk | mass | — | — |
| cilantro | Cilantro | **bunch** | `cilantro-bunch` | count | 40 | **60** |
| parsley-fresh | Fresh parsley | **bunch** | `parsley-fresh-bunch` | count | 50 | **60** |
| mint-fresh | Fresh mint | **bunch** | `mint-fresh-bunch` | count | 30 | **60** |
| basil-fresh | Fresh basil | **bunch** ⚠ | `basil-fresh-bunch` | count | 28 | **60** |
| rosemary-fresh | Fresh rosemary | **bunch** ⚠ | `rosemary-fresh-bunch` | count | 20 | **60** |
| thyme-fresh | Fresh thyme | **bunch** ⚠ | `thyme-fresh-bunch` | count | 15 | **60** |
| kale | Kale | **bunch** | `kale-bunch` | count | 200 | **60** |
| celery | Celery | **bunch** | `celery-bunch` | count | 450 | **60** |
| asparagus | Asparagus | **bunch** | `asparagus-bunch` | count | 450 | **60** |
| garlic-prepeeled | Peeled garlic (retail) | **mass** | bulk | mass | — | — |

⚠ = judgement call (see below).

Not in seed catalog (mentioned in brief, no row): chard, salad greens mix, corn kernels (fresh off-cob — use frozen/canned elsewhere).

---

## Every `gramsPerCount` with source

| Item | g | Source |
|---|---:|---|
| Apple (medium 3" dia) | 182 | USDA SR Legacy — Apples, raw, with skin |
| Banana (medium 7–7⅞") | 118 | USDA SR Legacy — Bananas, raw |
| Orange (medium 2⅝" dia) | 131 | USDA SR Legacy — Oranges, raw, all commercial varieties |
| Lemon (whole with peel) | 84 | Kitchen/retail whole fruit; USDA edible without peel is 58 g for 2⅛" fruit |
| Lime (2" dia) | 67 | USDA SR Legacy — Limes, raw |
| Peach (medium 2⅔" dia) | 150 | USDA SR Legacy — Peaches, raw |
| Pear (medium) | 178 | USDA SR Legacy — Pears, raw |
| Mango (whole fruit) | 200 | Kitchen avg — cultivar mass varies widely |
| Pineapple (whole) | 900 | Kitchen avg |
| Watermelon (whole) | 9000 | Kitchen avg — extreme size variance |
| Tomato (medium 2⅗" dia) | 123 | USDA SR Legacy — Tomatoes, red, ripe, raw |
| Roma / plum tomato | 62 | USDA plum/Roma class household measure |
| Onion medium (2½" dia) | 110 | USDA SR Legacy — Onions, raw (**was 140 kitchen avg**) |
| Shallot | 40 | Kitchen avg |
| Green onion stalk | 15 | Kitchen avg |
| Garlic clove | 3 | USDA / kitchen (existing `KNOWN_DENSITIES.garlic_clove_g`) |
| Garlic bulb | 60 | Kitchen avg (high variance) |
| Russet potato medium | 173 | Kitchen/retail ~6 oz baking potato; 5 lb bag ≈ 13.1 count. USDA white-potato "medium" is 213 g — we chose bag-sizing alignment |
| Red / Yukon potato | 150 | Kitchen avg (bag size spread) |
| Sweet potato medium | 130 | USDA SR Legacy — Sweet potato, raw |
| Carrot medium | 61 | USDA SR Legacy — Carrots, raw |
| Ginger knob | 30 | Kitchen avg |
| Avocado whole Hass | 170 | Kitchen/retail whole fruit; USDA edible California (no skin/seed) often ~136 g |
| Bell pepper medium | 119 | USDA SR Legacy — Peppers, sweet, green, raw |
| Jalapeño | 14 | USDA SR Legacy — Peppers, jalapeño, raw |
| Cucumber 8¼" | 301 | USDA SR / SNAP-Ed household measure |
| Zucchini medium | 196 | USDA SR Legacy — Squash, summer, zucchini, raw |
| Yellow squash | 196 | Same class as zucchini |
| Eggplant | 548 | USDA SR Legacy — Eggplant, raw (high size variance) |
| Corn ear | 150 | Kitchen avg ear with cob |
| Romaine head | 300 | Kitchen/retail (hearts packs differ) |
| Iceberg head | 539 | USDA SR Legacy — Lettuce, iceberg, raw |
| Cabbage head medium | 908 | USDA SR Legacy — Cabbage, raw |
| Broccoli crown | 250 | Retail crown; full USDA bunch ~608 g |
| Cauliflower head medium | 588 | USDA SR Legacy — Cauliflower, raw (5–6" dia) |
| Cilantro / parsley / mint / basil / rosemary / thyme bunches | 40 / 50 / 30 / 28 / 20 / 15 | Kitchen avg — **not** precise; unc ≥ 50–60% |
| Kale / celery / asparagus bunches | 200 / 450 / 450 | Kitchen/retail typicals — high unc |

Registry: `packages/core/src/seed/sources.ts` (`usda`, `kitchen_avg`, `culinary`). Edge `source` fields use these tags.

---

## Judgement calls (uncertain marked ⚠)

| Call | Decision | Rationale |
|---|---|---|
| **Carrots ⚠** | Count default + mass bulk | Bags are sold by lb; recipes often say "2 carrots". Count with USDA medium 61 g; bags attach to mass form. **Depends on recipe** for baby carrots (bag-only). |
| **Mushrooms ⚠** | Mass | Always sold in 8 oz packs; recipes use oz/cups. Counting individual buttons is unusual. |
| **Bananas** | Each (not bunch) | Recipes say "2 bananas"; bunch is a package label on the each form (~700 g), not the default form. |
| **Broccoli** | Head = crown 250 g | Recipes say "1 head broccoli" meaning a crown; full bunch is larger (package `bunch` 500 g). |
| **Basil / rosemary / thyme ⚠** | Bunch form | Often clamshells by weight in US stores, but "a bunch of basil" is the natural recipe unit. High unc (60%). Mass bulk retained for clamshell receipts. |
| **Garlic** | Clove default (unchanged) | Already multi-form; bulb available. Correct for recipes. |
| **Ginger** | Knob count | Sold by weight at the scale; recipes say "1-inch knob". High unc. |
| **Onion g/pc** | 110 g (USDA medium) not prior 140 | Prefer documented USDA medium over kitchen 140. Chopped edge factor updated. |
| **Potato 173 g vs USDA 213 g** | 173 g | Matches existing package `each_medium` and brief "5 lb → ~13 potatoes". Uncertainty 30% covers size spread. |
| **Avocado 170 vs USDA edible 136** | 170 whole fruit | Purchase weight is whole fruit (skin+seed+flesh). |
| **Roma tomato** | Count (was mass) | Same handling as standard tomatoes — sold and used as individuals. |
| **Pineapple** | Whole count (was mass-only) | "1 pineapple" is natural; mass bulk retained. |
| **Peas / raspberries / blackberries / eggplant / peach / pear** | Added to seed | Brief classification list; filled gaps in catalog. |

### Recipe-dependent answers

These are genuinely ambiguous depending on how the line is written:

1. **Carrots** — "2 carrots, diced" → count; "1 lb baby carrots" → mass. Both forms exist; default is count.
2. **Broccoli** — "1 head, florets" vs "12 oz florets bag" → head vs mass bulk.
3. **Celery** — "1 bunch" vs "2 stalks" — we default to bunch; stalk-level count is not modeled (recipes often use grams on bulk form today).
4. **Herbs** — "1 bunch cilantro" vs "2 tbsp chopped" — bunch default; chopped mass form remains on cilantro; other herbs keep bulk mass for gram lines.
5. **Potatoes** — bag by lb (mass form) vs "2 potatoes" (count). Both work via edge + gramsPerCount.

---

## Migration

### What changed for existing installs

- **`SEED_VERSION` bumped to `1.1.0`** so app seed re-upserts ingredients/forms/edges/packages when meta is stale.
- **Mass form ids preserved** for items that were previously `simpleMass` (e.g. `potato-russet-bulk`, `carrot-bulk`, `avocado-bulk`, `celery-bulk`, `parsley-fresh-bulk`). Pantry rows and starter recipes that reference those form ids **continue to resolve**.
- **Historical count form ids preserved** where they already existed (`apple-each`, `lemon-each`, `onion-whole`, `onion-red-each`, `tomato-each`, `watermelon-each`, …).
- **New count forms added** as defaults (e.g. `potato-russet-whole`, `avocado-each`) with edges `count → bulk` at `factor = gramsPerCount`.
- **defaultFormId** on ingredients updates on catalog re-seed (ingredient table upsert).

### Is an app-side pantry migration required?

**Not required for data survival or cook convertibility.**

- Old pantry rows keep pointing at still-present mass form ids.
- Cook planning converts recipe count forms against pantry mass forms via seed edges (covered by test).
- Pattern comparison: `migrateLocationsTree` rewrote location ids because locations were *removed*. Here forms are *added*, not deleted.

**Optional (separate track)** if product wants pantry UI to show "13 potatoes" instead of "5 lb" after upgrade:

1. On seed version transition `1.0.0` → `1.1.0`, for produce ingredients whose default form changed from mass→count, rewrite `pantry_items.form_id` / ledger form ids to the new count form and convert `qty_base` using `gramsPerCount`.
2. Or leave stock on mass and only use count for new receipts / quick-adds (simpler; current behavior).

**Report for app track:** no mandatory migration; optional qty remapping if UI should display count after upgrade.

---

## Implementation notes

- Helper `countWithMass` / `bunchWithMass` in `produce.ts` mirrors the butter pattern (count default + bulk mass + edge).
- Mass packages (`bag_5lb`, `lb`, …) attach to the mass form; piece packages attach to count.
- Onion multi-form: `whole` + `chopped` + `bulk` (receipt lb).
- Cilantro multi-form unchanged in spirit: bunch + chopped + dried.

### Files touched

| Path | Change |
|---|---|
| `packages/core/src/seed/categories/produce.ts` | Full reclassification |
| `packages/core/src/seed/index.ts` | `SEED_VERSION` → `1.1.0` |
| `packages/core/test/seed/produce-count.test.ts` | New tests |
| `reports/feat-produce-by-count.md` | This report |

### Out of scope (per brief)

- `packages/core/src/units/**`, pantry, recipes modules, `apps/web/**`, supabase, native

---

## Tests added

`packages/core/test/seed/produce-count.test.ts`:

1. Apples / onions / potatoes (and peers) default to **count**; berries / grapes / cherry tomatoes default to **mass**
2. Round-trip: `5 lb potatoes → count → grams` ≈ 5 lb; graph path bulk↔whole
3. `planCook`: recipe "2 potatoes" against pantry holding 5 lb mass form → status `enough`, need ≈ 346 g
4. Bunch items (cilantro, parsley, mint, kale, celery, basil) have uncertainty ≥ 50%
5. `validateSeed` still passes

---

## Verification

```
npm run typecheck && npm run lint && npm run test && npm run build
```

**Result: all green (exit 0)**

| Gate | Result |
|---|---|
| typecheck (core + web) | pass |
| lint | pass |
| core tests | **313** passed (30 files) — was ~285; +28 produce-count tests |
| web tests | **313** passed (28 files) |
| seed `validateSeed` | pass (via produce-count + validate suites) |
| build (vite) | pass |

No commits created (per brief).

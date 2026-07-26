# M3 Track C — 50 original starter recipes

**Package:** `@larder/core`  
**Scope:** `packages/core/src/seed/recipes/**` + `packages/core/test/seed/recipes.test.ts`  
**Status:** Complete. Verification green.

---

## Original authorship (legal)

**Every recipe in this catalog is originally written for The Good Pantry.**

- Titles, step prose, headnotes-in-steps, and yield notes were authored for this product.
- No text was copied, lightly reworded, or adapted from Allrecipes, NYT Cooking, Serious Eats, food blogs, or any other copyrighted recipe source.
- Dishes that exist in the common repertoire (carbonara-adjacent garlic pasta, black bean tacos, chicken noodle soup, etc.) are fine; the *wording* is original.
- Ingredient lists use catalog ids only; lists themselves are not copyrightable, but the surrounding prose is original regardless.

---

## Layout

```
packages/core/src/seed/recipes/
  helpers.ts          # qty / taste / step / recipe builders
  breakfast.ts        # 7
  pasta.ts            # 7
  weeknight.ts        # 10
  one-pan.ts          # 6
  soups.ts            # 6
  salads-bowls.ts     # 6
  sides.ts            # 4
  weekend.ts          # 2
  desserts.ts         # 2
  index.ts            # barrel → starterRecipes, STARTER_RECIPE_CATEGORIES
packages/core/test/seed/recipes.test.ts
```

**Not touched:** other `packages/core` modules, `apps/web/**`, `supabase/**`, root barrel exports. Consumers import from `packages/core/src/seed/recipes` (deep path) until the architect wires a public re-export.

---

## Recipes by category

### Breakfast (7)

| Id | Title | Servings | Time |
|---|---|---:|---|
| `recipe-spinach-scramble` | Spinach Cheddar Scramble | 2 | 5+8 |
| `recipe-overnight-oats` | Overnight Oats with Berries | 2 | 10+0 |
| `recipe-banana-pancakes` | Banana Yogurt Pancakes | 3 | 10+15 |
| `recipe-avocado-egg-toast` | Avocado Toast with Fried Egg | 2 | 5+8 |
| `recipe-breakfast-burrito` | Weekday Breakfast Burrito | 4 | 10+15 |
| `recipe-yogurt-berry-parfait` | Greek Yogurt Berry Parfait | 2 | 8+0 |
| `recipe-cinnamon-oatmeal` | Brown Sugar Cinnamon Oatmeal | 2 | 3+10 |

### Pasta (7)

| Id | Title | Servings | Time |
|---|---|---:|---|
| `recipe-garlic-butter-pasta` | Garlic Butter Pasta | 4 | 10+15 |
| `recipe-penne-marinara` | Penne with Quick Marinara | 4 | 10+25 |
| `recipe-creamy-parmesan-penne` | Creamy Parmesan Penne | 4 | 10+20 |
| `recipe-lemon-garlic-spaghetti` | Lemon Garlic Spaghetti | 4 | 10+15 |
| `recipe-sausage-pepper-pasta` | Italian Sausage and Pepper Pasta | 4 | 10+25 |
| `recipe-tuna-pasta-skillet` | Pantry Tuna Pasta | 4 | 8+18 |
| `recipe-baked-ziti-style` | Weeknight Baked Ziti | 6 | 15+35 |

### Weeknight dinners (10)

| Id | Title | Servings | Time |
|---|---|---:|---|
| `recipe-black-bean-tacos` | Black Bean Tacos | 4 | 10+15 |
| `recipe-chicken-soy-skillet` | Garlic Soy Chicken Skillet | 4 | 10+18 |
| `recipe-turkey-taco-skillet` | Turkey Taco Skillet | 4 | 10+20 |
| `recipe-garlic-butter-shrimp` | Garlic Butter Shrimp | 3 | 10+10 |
| `recipe-cheese-quesadillas` | Crispy Cheese Quesadillas | 4 | 5+15 |
| `recipe-egg-fried-rice` | Better-Than-Takeout Egg Fried Rice | 4 | 10+12 |
| `recipe-teriyaki-chicken-bowls` | Teriyaki Chicken Rice Bowls | 4 | 10+20 |
| `recipe-tuna-melts` | Open-Faced Tuna Melts | 4 | 10+10 |
| `recipe-bbq-chicken-skillet` | Skillet BBQ Chicken | 4 | 10+20 |
| `recipe-pork-chops-pan` | Pan-Seared Pork Chops with Apples | 4 | 10+20 |

### One-pan & sheet-pan (6)

| Id | Title | Servings | Time |
|---|---|---:|---|
| `recipe-sheet-pan-chicken-veg` | Sheet-Pan Chicken and Vegetables | 4 | 15+35 |
| `recipe-sheet-pan-sausage-peppers` | Sheet-Pan Sausage, Peppers, and Onions | 4 | 10+30 |
| `recipe-one-pan-chicken-rice` | One-Pan Chicken and Rice | 4 | 15+35 |
| `recipe-skillet-beef-rice` | Beef and Rice Skillet | 4 | 10+30 |
| `recipe-baked-cod-tomatoes` | Baked Cod with Tomatoes and Olives | 4 | 10+20 |
| `recipe-honey-garlic-salmon` | Honey Garlic Salmon | 4 | 10+15 |

### Soups (6)

| Id | Title | Servings | Time |
|---|---|---:|---|
| `recipe-chicken-noodle-soup` | Homestyle Chicken Noodle Soup | 6 | 15+35 |
| `recipe-tomato-basil-soup` | Creamy Tomato Basil Soup | 4 | 10+25 |
| `recipe-black-bean-soup` | Smoky Black Bean Soup | 4 | 10+25 |
| `recipe-lentil-vegetable-soup` | Lentil Vegetable Soup | 6 | 15+40 |
| `recipe-potato-corn-chowder` | Potato Corn Chowder | 4 | 15+30 |
| `recipe-simple-minestrone` | Simple Minestrone | 6 | 15+35 |

### Salads & grain bowls (6)

| Id | Title | Servings | Time |
|---|---|---:|---|
| `recipe-greek-cucumber-tomato` | Greek Cucumber Tomato Salad | 4 | 15+0 |
| `recipe-chopped-chicken-salad` | Chopped Chicken Salad | 4 | 20+15 |
| `recipe-quinoa-chickpea-bowl` | Quinoa Chickpea Grain Bowl | 4 | 15+20 |
| `recipe-rice-black-bean-bowl` | Rice and Black Bean Bowl | 4 | 10+25 |
| `recipe-simple-green-salad` | Everyday Green Salad | 4 | 10+0 |
| `recipe-couscous-vegetable-bowl` | Lemon Couscous Vegetable Bowl | 4 | 15+15 |

### Sides (4)

| Id | Title | Servings | Time |
|---|---|---:|---|
| `recipe-garlic-roasted-broccoli` | Garlic Roasted Broccoli | 4 | 8+20 |
| `recipe-honey-roasted-carrots` | Honey Roasted Carrots | 4 | 10+25 |
| `recipe-mashed-potatoes` | Buttery Mashed Potatoes | 6 | 15+25 |
| `recipe-skillet-green-beans` | Skillet Green Beans with Garlic | 4 | 8+12 |

### Weekend (2)

| Id | Title | Servings | Time |
|---|---|---:|---|
| `recipe-simple-beef-stew` | Simple Beef Stew | 6 | 25+120 |
| `recipe-roast-chicken-thighs` | Crispy Roast Chicken Thighs | 4 | 15+45 |

### Desserts (2)

| Id | Title | Servings | Time |
|---|---|---:|---|
| `recipe-skillet-chocolate-chip-cookie` | Skillet Chocolate Chip Cookie | 8 | 15+25 |
| `recipe-cinnamon-baked-apples` | Cinnamon Baked Apples | 4 | 15+35 |

**Total: 50**

Coverage notes: mix of vegetarian and meat; many ≤30 min weeknight meals; one-pan/sheet-pan; make-ahead (overnight oats, burritos, soups, stew); sides; two simple desserts.

---

## Catalog gaps (dishes skipped or substituted)

Useful signal for the seed ingredient track — **no ingredients were added** from this track.

| Wanted / considered | Gap | What we did instead |
|---|---|---|
| Tofu scramble, mapo-ish, stir-fries with tofu | No `tofu` / `tempeh` | Used eggs, beans, cheese for vegetarian protein |
| Classic pesto pasta | No pine nuts / dedicated pesto | Lemon-garlic and jar-sauce pasta instead |
| Coconut curry with Thai basil | Thin on Thai-specific produce | Skipped; teriyaki/soy skillet covered Asian-ish weeknight |
| Fish tacos with cabbage slaw + crema | Workable with catalog, but prioritized breadth | Black bean + turkey taco skillet instead |
| Cornbread / biscuits | Possible with catalog | Chose skillet cookie + baked apples for desserts |
| Tortillas / buns as count | Forms are mass bulk only (`tortilla-*-bulk`, `hamburger-bun-bulk`) | Used package-derived gram estimates (e.g. ~42 g flour tortilla) |
| Fresh ginger by teaspoon | Only `ginger-root-knob` (count) | Fractional knobs (`0.25 each`) where needed |

---

## Validation test coverage

File: `packages/core/test/seed/recipes.test.ts` (14 tests).

| Assertion | Why |
|---|---|
| Exactly 50 recipes | Scope lock |
| No duplicate ids | Silent overwrite risk |
| Ids match `recipe-[a-z0-9-]+` | Deterministic slugs |
| `servings > 0`, ≥1 step, ≥2 ingredients | Basic recipe shape |
| **Every `ingredientId` + `formId` resolves** against `seedIngredients` / `seedForms` | Cook-now + deduct integrity |
| Form’s `ingredientId` matches the line’s ingredient | Cross-wired form bug |
| `unknownAllergens` never `true` on catalog lines | Safety display |
| Quantified lines: finite qty > 0 + unit | Scaling / planCook input |
| Non-quantified: null qty or `nonQuantified` | To-taste / garnish |
| **Timers:** `durationSec` only when finite, 30s–12h, and step text has timed-action language | Cooking-mode timers aren’t spam |
| Not every step has a timer | Selective timers |
| Categories barrel = flat list, no overlap | Barrel integrity |
| `visibility: 'public'`, `authorId: 'good-pantry'`, no household | Catalog identity |

---

## Deviations / design choices

1. **Did not export from `seed/index.ts` or core root barrel** — brief forbids touching other core files. Import path: `@larder/core` deep path `src/seed/recipes` until architect re-exports.
2. **`unknownAllergens: false`** set on every line (including optional garnishes) because all lines resolve to catalog ids.
3. **Butter** prefers `butter-tbsp` + `tbsp` or `butter-stick` + `each` (not mass on stick form) so form dimension matches unit.
4. **Garlic** uses `garlic-clove` + `each`; dried powder uses separate ingredient `garlic-powder` / `garlic-powder-bulk` (not the `garlic-powder` form on the fresh garlic ingredient).
5. **Water** uses `water-bottled` (catalog has no free “tap water” id) for chowder/baked apples liquid.
6. **Overnight oats chill timer** is 6 hours (21600s) — within the 12h test ceiling so cooking mode can still offer a long timer.

---

## Verification

```
npm run typecheck && npm run test && npm run build
```

| Gate | Result |
|---|---|
| typecheck (core + web) | pass |
| `@larder/core` tests | **279** passed (was ~265; +14 recipe tests) |
| `@larder/web` tests | **231** passed |
| `npm run build` (web vite) | pass |

No git commits created.

---

## Open questions

1. **Should `starterRecipes` be re-exported from `@larder/core` root and/or `seed/index.ts`?** UI/fixtures currently hardcode 4 demo recipes; wiring the catalog is a separate integration task.
2. **Hydration path:** load into SQLite/Supabase as global public recipes (`householdId` null) vs client-only seed at first launch.
3. **Hero images:** SPEC notes ~50 catalog recipes need images (DESIGN.md) — not in this track.
4. **Tortilla/bun count forms** would make recipe lines more natural (`8 each` vs grams); recommend seed-track multi-form for pack counts.
5. **Tofu / tempeh / pine nuts** would unlock more vegetarian and Mediterranean recipes without free-text lines.

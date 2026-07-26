# M1 Track C — recipes, cook planning, grocery lists

**Package:** `@larder/core`  
**Scope:** `packages/core/src/recipes/**`, `packages/core/src/grocery/**`, and tests under `test/recipes/**`, `test/grocery/**`  
**Status:** Implementation complete. Core suite green with this track’s tests included (36 new under `test/recipes` + `test/grocery`). Workspace total at last run: **219** tests (other parallel tracks also landing). Root barrel `src/index.ts` **not** edited (architect wires exports).

---

## planCook status model

Per-line result: `{ line, needBase, haveBase, shortfallBase, convertible, uncertaintyPct, status, … }`.

| Status | Meaning | Blocks cook? |
|---|---|---|
| `enough` | `haveBase >= needBase` after conversion | No |
| `short` | Convertible but shortfall &gt; 0 | Yes (unless optional / group satisfied) |
| `not-convertible` | `convert()` failed — **no path** | Yes (unless optional) |
| `not-in-pantry` | No pantry rows for ingredient (+ substitutes) | Yes (unless optional) |
| `optional-missing` | Optional line absent or short | **Never** |
| `non-quantified` | “to taste” / pinch — no qty | **Never** |

### Non-negotiable conversion policy

- Need is converted into the pantry form’s base via `convert()` from `src/units/`.
- On failure: `status = 'not-convertible'`, `convertible = false`, **`needBase` / `haveBase` / `shortfallBase` are `null`**.
- **Never guess. Never treat unconvertible as zero shortfall.** Covered by headline test in `test/recipes/plan.test.ts`.
- `uncertaintyPct` is surfaced from the conversion path so UI can warn on shaky bridges.

### Ranges

`needQtyFromLine` uses **`qtyHigh`** (when range / high present) for need and shortfall — under-buying means a second trip. Midpoint stays on the scaled line for other consumers.

### Substitution

1. **`group`** — lines sharing a group id: any member with `enough` or `non-quantified` marks `groupSatisfied` for the whole group; other members no longer block.
2. **`substitutes[]`** — alternative ingredient ids tried after the primary; first that covers need wins (`satisfiedByIngredientId`).

### Purity

`planCook` only returns a plan. **No transactions, no I/O, no clock reads.** Committing cook deductions is the caller’s job.

---

## Scaling

`scaleRecipe(recipe, targetServings)` multiplies quantified lines by `target / recipe.servings`.

- **Fractional counts** (e.g. 2.5 eggs) kept as finite numbers with `fractionalCount: true` — never silently rounded.
- **Non-quantified** lines (`qty`/`unit` null or `nonQuantified: true`) pass through with `scaleFactor: 1`.

---

## Cook-now matching

`findCookableRecipes(recipes, pantry, opts)` — free-tier, offline, deterministic. Not AI.

### Ranking

1. Fully cookable first (`missingCount === 0` / `canCook`)
2. Fewest `missingCount`
3. Higher `useUpCount` (ingredients used by the recipe that expire within horizon — default 7d)
4. Stable tie: `recipe.id` lexicographic

`useUp` powers *“Use up: spinach, garlic, parmesan”*. Clock is **injected** via `opts.now`.

### Complexity

- Build `Map<ingredientId, PantryStockRow[]>` once — **O(P)**
- Per recipe: `planCook` with O(1) map lookups per line — **O(Σ lines)** overall
- **Not** O(R × L × P) linear pantry scan inside the line loop

**Performance test:** 2,000 recipes × 8 lines, 500 pantry items — measured **~379 ms** on this machine; bound asserted at **&lt; 5 s** (guards against accidental cubic scans without flaking on slow CI).

---

## Grocery list

### Sources

`buildList({ sources, shoppingTripId, now, forms?, edges?, ingredients? })` merges:

| Kind | Helper |
|---|---|
| `manual` | `manualSource` / plain source objects |
| `stock-low` / `stock-out` | `sourcesFromStock` (from `evaluateStock` results) |
| `recipe-shortfall` | `sourcesFromPlanShortfalls` / `sourcesFromPlans` |
| `reorder` | `sourcesFromReorder` |

### Aggregation policy

- Group by `ingredientId`.
- Within a group, sum contributions that **convert into a common form/dim** via `convert()`.
- If two contributions cannot share a form: **keep separate lines**, set `unmerged: true` and `unmergedReason` — **never silently sum** incompatible units.
- Free-text (no `ingredientId`): one line each.
- Ranges → **high** via `purchaseQtyFromSource`.
- Display: `formatQuantity(qtyBase, dim)` → purchase units (“2 lb”, not “907 g”).
- Aisle groups: `Ingredient.category` (fallback `"Other"`).
- **`shoppingTripId`** carried for track D receipt reconciliation — this module does not reconcile.

---

## Files added

```
packages/core/src/recipes/
  types.ts, scale.ts, plan.ts, cookable.ts, index.ts
packages/core/src/grocery/
  types.ts, sources.ts, aggregate.ts, build.ts, index.ts
packages/core/test/recipes/
  helpers.ts, scale.test.ts, plan.test.ts, cookable.test.ts
packages/core/test/grocery/
  build.test.ts
reports/m1-c-recipes.md
```

**Not edited:** `src/index.ts`, `src/domain/`, `src/units/`, `src/pantry/`, `src/matching/`, `src/dedupe/`, `src/seed/`, `apps/**`.

---

## Test coverage (36 new)

| Area | Cases |
|---|---|
| Scaling | factor applied; fractional count flagged not rounded; non-quantified unscaled; range high/low scaled |
| planCook | enough, short, **not-convertible ≠ 0**, not-in-pantry, optional-missing, non-quantified, group satisfied by one member, substitutes[], uncertainty, range high, servings scale, purity |
| Cook-now | fully-cookable first; fewest missing; expiry-driven use-up; deterministic id ties; limit; **perf 2k×500** |
| Grocery | mixed-unit merge → one line; non-convertible pair separate + flagged; range high; formatQuantity purchase units; aisle groups; multi-source merge; shoppingTripId; stock/plan source helpers |

---

## Verification

```
npm run test -w @larder/core
# All green (219 at last full run, including parallel tracks)
# cook-now 2000×500 ~380–480ms
```

```
npm run typecheck -w @larder/core
# BLOCKED by parallel track only:
#   src/seed/categories/canned.ts(7,36): 'simpleVolume' declared but never used
# Zero errors in recipes/** or grocery/**.
```

---

## Deviations

- Root barrel not updated (per brief).
- `PantryStockRow` is a minimal planning snapshot, not full SPEC `PantryItem` (locations, par, provenance live in pantry track).
- Garlic clove↔minced edges are not seeded here; tests deliberately use empty edges to prove `not-convertible`.
- Performance bound is 5 s (generous for CI); observed ~0.4 s.

---

## Open questions

1. **Architect export wiring** — when should `src/index.ts` re-export recipes/grocery?
2. **Substitute cross-form conversion** — should substitutes try converting the *recipe line’s form* against the *substitute ingredient’s* forms, or require matching dims only? Current: same convert path as primary against substitute’s pantry rows.
3. **Already-expired items in use-up** — included (urgent). Confirm product wants past-due in the “Use up” chip list.
4. **Stock suggested qty** — `sourcesFromStock` defaults to `par − qty` (or par when out). Is package size preferred when par is unknown?
5. **Parallel seed track** — unused `simpleVolume` import breaks full-package typecheck; out of scope for C.

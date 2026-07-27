# Fix: 50 catalogue recipes never reached the app

**Status:** Complete. Verification green.

## Problem

The starter catalogue (`packages/core/src/seed/recipes/`, 50 recipes) was written and tested in isolation but never wired into the product:

1. Not exported from `@larder/core` root barrel
2. `apps/web/src/db/seed.ts` never loaded them
3. Recipes tab only showed the 4 DEV fixture recipes under “My Recipes”

Same failure mode as the inert home screen: text/route checks passed while the catalogue stayed dark.

## 1. Export and seed

### Core barrel (`packages/core/src/index.ts` only)

Re-exported:

- Ingredient seed: `SEED_VERSION`, `seedCatalog`, `seedIngredients` / forms / edges / packages, validators
- Starter recipes: `starterRecipes`, `STARTER_RECIPE_CATEGORIES`, `getStarterRecipe`, `countStarterRecipes`

No recipe data or logic under `packages/core/src/seed/recipes/**` was changed.

### Versioned, idempotent recipe seed

| Meta key | Constant | Purpose |
|---|---|---|
| `app_meta.seed_version` | core `SEED_VERSION` (`1.0.0`) | Ingredients / forms / edges / packages |
| `app_meta.recipe_seed_version` | web `RECIPE_SEED_VERSION` (`1.0.0`) | Starter recipe catalogue |

Recipe version is **independent** of the ingredient seed version so existing installs that already ran ingredient seed `1.0.0` still pick up the 50 recipes without wiping pantry or user data.

Flow in `runSeed` / `runDevSeed`:

1. Locations + tree migration (unchanged)
2. Ingredient catalog upsert if `SEED_VERSION` changed (or `force`)
3. **Always** check recipe meta separately → upsert starter recipes if `RECIPE_SEED_VERSION` changed (or `force`)
4. Stamp the matching meta key

### Catalogue marking (`source: 'catalog'`)

There is no new SQL column. Ownership is derived and exposed as `source: 'catalog' | 'user'` on `RecipeSummary` / `RecipeDetail`:

- Seeded rows: `householdId: null`, `authorId: 'good-pantry'`, tag `'catalog'`, `visibility: 'public'`
- `isCatalogRecipe()` / `recipeSource()` in `apps/web/src/db/seed-recipes.ts`
- Re-seed **only** updates rows still classified as catalogue; never deletes or overwrites user-owned ids

Mapping: `starterRecipeToWrite()` → `DomainRepository.createRecipe` / `updateRecipe`.

## 2. Mine / Browse split

Recipes screen title remains **My Recipes**. Content is split:

| Segment | Content |
|---|---|
| **Mine** | User-created + fixture + forked/saved recipes (`source: 'user'`) |
| **Browse** | The 50 starter catalogue recipes (`source: 'catalog'`) |
| **Community** | Navigates to `/community` |

Secondary filter **All / Can make now** still applies to the active shelf.

Search scopes to the **visible shelf**, matching title **and** ingredient `rawText` / `ingredientId` (`searchRecipes` in `features/recipes/shelf.ts`).

Empty Mine invites create + “Browse catalogue” (`?shelf=browse`). Saving a catalogue recipe on detail uses `buildForkedRecipe` (same path as community) → private copy in Mine with `forkedFrom` set.

## 3. Community entry

Third segment **Community** on the Recipes shelf calls `navigate('/community')`. Offline community still uses `DEMO_PUBLIC_RECIPES`; page renders without error when the backend list is empty.

## Files touched (scope)

- `packages/core/src/index.ts` — export only
- `packages/core/test/integration/barrel.test.ts` — barrel coverage for seed + recipes
- `apps/web/src/db/**` — seed, constants, types, domain + dev list mapping, seed-recipes helper
- `apps/web/src/features/recipes/**` — shelf helpers, empty state, card testids, index exports
- `apps/web/src/routes/RecipesPage.tsx` — Mine / Browse / Community UI
- `apps/web/src/routes/RecipeDetailPage.tsx` — “Save to My Recipes” for catalogue (fork)
- `apps/web/scripts/verify-interactivity.mjs` — count-based Browse assertions
- `reports/fix-recipe-catalog.md` — this report

## Tests that would have caught the bug

| Assertion | Where |
|---|---|
| After seed, repository returns **50+** recipes (50 catalog) | `datalayer.test.ts`, `dev.test.ts` |
| Browse filter yields **>10** cards | `shelf.test.ts` |
| Seed twice does not duplicate | `datalayer.test.ts` |
| User-created recipe survives re-seed (`force`) | `datalayer.test.ts` |
| Opening a catalogue recipe reaches detail | `verify-interactivity.mjs` |
| Browse list **count > 10** (not just route text) | `verify-interactivity.mjs` |

## Verification

```
npm run typecheck   # green
npm run lint        # green
npm run test        # core 280, web 294
npm run build       # green
node apps/web/scripts/verify-interactivity.mjs
  → Browse list populated: 50 recipe cards (>10)
  → catalogue recipe detail opens → /recipes/recipe-avocado-egg-toast
  → Community segment → /community
  → all interactivity checks passed
node apps/web/scripts/verify-chrome.mjs
  → /recipes chrome clean
  → pre-existing FAIL on /grocery only:
    checkbox "Check Chocolate chips…" under sticky BUTTON("Add")
    Out of scope for this brief (grocery UI not touched). Reproduced twice.
```

No git commits created.

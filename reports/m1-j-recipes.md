# M1 Track J — Recipes and the cook → deduct flow

**Date:** 2026-07-26  
**Scope:** `apps/web/src/features/recipes/**`, routes `RecipesPage.tsx`, `RecipeDetailPage.tsx`, `RecipeEditPage.tsx`, `CookPage.tsx`  
**Not touched:** `App.tsx`, `src/ui/**`, `src/state/**`, `src/db/**`, `packages/core/**`, home / pantry / grocery feature folders  
**Commits:** none (per brief)

---

## Verification

| Command | Result |
|---|---|
| `npm run test -w @larder/core` | **248** pass |
| `npx vitest run` (web) | **102** pass (includes **14** new cook-machine tests + parallel tracks’ tests + prior 44 datalayer/contrast) |
| `npx vitest run src/features/recipes/cook-machine.test.ts` | **14** pass |
| `npm run typecheck -w @larder/web` | **Blocked by parallel tracks** — errors in `features/pantry/**` and `features/grocery/**` (missing `FieldInput`/`FieldSelect`, RecipeLine qty typing). **Zero errors** under `features/recipes/**` or our four routes. |
| `npm run build -w @larder/web` | Same typecheck gate as above — blocked by parallel-track TS errors |
| Screenshot | `reports/cook-flow.png` (390px wide, cook preview statuses) |

---

## What shipped

### Recipe list (`RecipesPage`)
- Card grid: placeholder thumb, title, total time, servings, “Can make” badge
- Filter: **All** / **Can make now** via `findCookableRecipes`
- Search by recipe title **and** ingredient `rawText` / id
- Empty state invites create / browse
- Loading + error + no-repo states

### Recipe detail (`RecipeDetailPage`)
- Have / need / shortfall per line from `planCook`
- Status chips for every `CookLineStatus`
- Live servings stepper → `scaleRecipe` + `planCook` re-run
- Allergen-unknown badge on flagged lines
- “Add missing to grocery” via `sourcesFromPlanShortfalls`
- **Cook** CTA → `/recipes/:id/cook?servings=`

### Create / edit (`RecipeEditPage`)
- Title, servings, prep/cook min, ingredient lines, steps
- Catalog search (`seedIngredients`) or free text
- Free-text / unresolved lines force `unknownAllergens: true` (unsafe, never clear)

### Cook flow (`CookPage`) — core interaction
- Always shows editable preview before any txn
- Per line: need · have · shortfall · status · `uncertaintyPct`
- Edit actual used, skip, substitution note, send shortfall to grocery
- Confirm → `appendTxn` with `reason: 'cook'`, **shared `refId = cookEventId`**
- Undo → compensating `adjust_delta` under `undo-${cookEventId}`
- Negative stock → **“Still have some?”** dialog (no silent clamp)

---

## Cook-flow state machine

```
idle
  └─ startCook(recipe, servings, pantry) → preview

preview
  ├─ setLineActualUsed / setLineSkipped / setLineSubstitution / setLineSendToGrocery
  ├─ replanCook (servings / pantry change)
  ├─ requestConfirm
  │    ├─ any wouldGoNegative(have, used) → negative_prompt
  │    └─ else → beginCommit → committing
  └─ (done path only after commit)

negative_prompt
  ├─ cancelNegativePrompt → preview
  └─ acceptNegativeAndContinue → commit with full used amount
       (stock may go negative; projection keeps isNegative)

committing
  ├─ success → done (canUndo if any deductions)
  └─ failure → error

done
  └─ undo (compensating txns) → undone
```

**Pure module:** `apps/web/src/features/recipes/cook-machine.ts`  
**Tests:** `cook-machine.test.ts` (14 cases)

### Commit shape

```ts
{
  kind: 'relative',
  reason: 'cook',
  deltaBase: -actualUsedBase,
  refId: cookEventId,           // whole meal undoes as a unit
  clientTxnId: `${cookEventId}:${lineIndex}:…`,
}
```

Undo:

```ts
{
  kind: 'relative',
  reason: 'adjust_delta',
  deltaBase: -priorDelta,       // restores stock
  refId: `undo-${cookEventId}`,
}
```

---

## How each `planCook` status is presented

| Status | Chip label | Tone | Default deduct? | Blocks preview? |
|---|---|---|---|---|
| `enough` | Enough | fresh / ok | Yes (`actualUsed = need`) | No |
| `short` | Short | low / warn | Yes | No (user may still cook; grocery optional) |
| `not-convertible` | Not convertible | critical / danger | **No** — skipped; need/have/short = `—` | Surfaced; never treated as 0 |
| `not-in-pantry` | Missing | critical | No (no form to deduct) | Surfaced; grocery default on |
| `optional-missing` | Optional | muted | No | **Never blocks** |
| `non-quantified` | To taste | primary / info | No | **Never blocks** |

`groupSatisfied` shows “Substitution group covered” when any member is enough / non-quantified.

`uncertaintyPct > 0` → “Conversion uncertainty ≈ N%”.

---

## Negative-stock prompt

Uses `wouldGoNegative(haveBase, actualUsedBase)` from `@larder/core`.

- **Adjust amounts** → back to preview
- **Confirm anyway** → commit full used amount; pantry may show negative (SPEC recovery path)

Never clamps to `have`. Never hides the negative.

---

## Allergen flagging

- Edit form: unresolved free text → `unknownAllergens: true`
- Detail + cook preview: `AllergenUnknownBadge` (“Allergens unknown — treat as unsafe”)
- Unknown free-text lines do **not** auto-deduct

---

## Domain imports (deviation note)

`planCook` / `scaleRecipe` / `findCookableRecipes` / grocery sources are **not** on the `@larder/core` root barrel (architect-owned, same as seed). Track J imports them via:

```
packages/core/src/recipes/index.ts
packages/core/src/grocery/sources.ts
packages/core/src/seed/index.ts
```

No domain logic reimplemented in the UI. Conversion graph = seed forms/edges (same ids as DB seed).

---

## Deviations / open questions

1. **App routing not wired** — brief forbids `App.tsx`. Pages are ready for:
   - `/recipes`, `/recipes/new`, `/recipes/:id`, `/recipes/:id/edit`, `/recipes/:id/cook`
2. **Screenshot** is a static HTML mirror of the cook preview (design tokens + status presentation), not a live React route — required because App shell doesn’t mount recipe routes yet. File: `reports/cook-flow.png`. Regenerator: `node apps/web/scripts/screenshot-cook-flow.mjs`.
3. **No catalog list API on DomainRepository** — ingredient picker uses seed catalog in-process (correct ids; matches fixtures).
4. **Typecheck / build blocked by parallel pantry + grocery tracks** (incomplete `Sheet` exports, etc.). Recipe track files typecheck clean.
5. **Open:** Should household cook de-dupe (`findRecentCook` within 3h) surface on confirm in M1 or wait for sync? Core has the detector; UI does not prompt yet.
6. **Open:** When user edits “actually used” on a not-convertible line, we still need a `formId` to write a txn — currently skip unless form is known. Entering a free amount without form cannot hit the ledger without inventing a form (domain decision).

---

## File map

```
apps/web/src/features/recipes/
  cook-machine.ts          # state machine (pure)
  cook-machine.test.ts     # 14 tests
  catalog.ts               # seed search + conversion context
  mappers.ts               # RecipeDetail → core Recipe
  grocery-from-plan.ts     # shortfalls → grocery items
  core-imports.ts          # path imports into packages/core modules
  RecipeCard.tsx, CookPreviewLine.tsx, ServingsStepper.tsx,
  AllergenUnknownBadge.tsx, NegativeStockPrompt.tsx,
  IngredientLineEditor.tsx, LoadingErrorEmpty.tsx, …
apps/web/src/routes/
  RecipesPage.tsx
  RecipeDetailPage.tsx
  RecipeEditPage.tsx
  CookPage.tsx
reports/
  cook-flow.png
  m1-j-recipes.md
```

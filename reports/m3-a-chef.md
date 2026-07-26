# M3 Track A — AI chef (paid) + gluten safety gap

**Date:** 2026-07-26  
**Status:** Complete — verification green

## Verification

```
npm run typecheck && npm run test && npm run test:functions && npm run build
```

| Gate | Result |
|------|--------|
| typecheck | pass (core + web) |
| core tests | **265** passed (was 248 + dietary/gluten coverage) |
| web tests | **211** passed (was ~170 + community/import/cost + 5 chef) |
| function tests | **55** passed (39 parse-receipt + **16 chef**) |
| build | pass |

**Required safety test:** model response recommending gluten-flagged barley (and flour in free text, unknown substitutions, peanut sub) is blocked **server-side** in `enforceSafetyGate` — covered by `supabase/functions/chef/tests/safety_gate_test.ts` and `pipeline_test.ts`.

---

## Task 1 — Gluten / dietary-flag axis

### Design

- **`Allergen`** remains the FALCPA regulatory list (9 majors + sesame).
- **`DietaryFlag`** is a separate practical axis:  
  `'gluten' | 'pork' | 'alcohol' | 'beef' | 'shellfish-derived'`.
- `Ingredient.dietaryFlags: readonly DietaryFlag[]` is required (default `[]`).
- Seed helper **auto-derives `gluten` from FALCPA `wheat`** so wheat products cannot be under-tagged. Non-wheat gluten sources must set `dietaryFlags: ['gluten']` explicitly.
- Matching: `dietaryFlagsDisagree` / `canAutoMergeDietaryFlags` / `canAutoMergeSafety`; veto only checks axes present on the query (omitted dietary ≠ empty set).

### What we tagged

| Item | Allergen | Dietary flags | Notes |
|------|----------|---------------|-------|
| **barley** | none (removed fake `wheat`) | `gluten` | Closes the documented gap |
| **rye** | none | `gluten` | New seed row |
| **spelt** | `wheat` | `gluten` (auto) | Wheat species |
| **farro** | `wheat` | `gluten` (auto) | Wheat family |
| **malt-extract** | none | `gluten` | Barley malt |
| **yeast-brewers** | none | `gluten` | Brewing byproduct risk |
| **oats-rolled / steel-cut** | none | `gluten` | Conventional x-contam |
| **cereal-cheerios** | none | `gluten` | Oat cereal |
| **oat-milk** | none | `gluten` | Conventional oats |
| **soy-sauce** | wheat+soy | `gluten` (auto) | Explicit wheat |
| All other wheat-tagged seed | unchanged | `gluten` auto | flour, pasta, bread, … |
| **vanilla-extract** | none | `alcohol` | Culinary extract |
| **pork*** meats | none | `pork` | chop, loin, ground, bacon, ham, sausages |
| **beef*** meats | none | `beef` | ground, steak, roast, stew |
| **hot-dog** | none | `pork`+`beef` | Typical blend |
| **oyster-sauce** | shellfish+wheat+soy | +`shellfish-derived` | Non-allergic avoiders |

### Unsure / deliberate choices (over-tagging preferred)

1. **Tamari** — left without gluten (traditional wheat-free). Brands that add wheat should match `soy-sauce` instead. Risk: mislabeled “tamari” with wheat.
2. **Oats / oat milk / Cheerios** — flagged gluten for conventional cross-contamination. Certified GF products exist; we under-assume safety.
3. **Brewer’s yeast** — gluten-flagged; deliberately **not** aliased to nutritional yeast (usually GF).
4. **Hot dogs** — both pork and beef; pure beef franks over-tagged as pork.
5. **Breakfast sausage** — assumed pork (US default); turkey sausage would over-tag.
6. **Baking powder / pure yeast** — still unflagged (corn-starch / pure culture). Facility cross-contact is brand-specific.
7. **Rice vinegar / “malt” in vinegar** — not tagged; malt vinegar is not a separate seed SKU.
8. **DB persistence** — `dietaryFlags` live on core seed / Ingredient; web SQLite still stores allergens only (`src/db/**` out of scope). Chef loads flags from seed at request time.

### Matching test intent

- Barley gluten-flagged, **not** FALCPA wheat.
- Empty dietary flags vs `['gluten']` refuses auto-merge (`canAutoMergeSafety`).
- Gluten avoider blocked via `ingredientHitsAvoidList`.

---

## Task 2 — Chef Edge Function

**Path:** `supabase/functions/chef/` (mirrors parse-receipt structure).

### Pipeline

1. Auth (Bearer JWT)
2. **Entitlement** — paid / pro / unlimited only; free → `entitlement_required` + upgrade copy (never broken model call)
3. **Rate limit** — per-user rolling window (default 30/hour)
4. **Dollar budget** — monthly USD circuit breaker (default $3 paid; env `CHEF_MONTHLY_BUDGET_USD`)
5. OpenRouter chat (Flash-class; recipe intent can use `CHEF_RECIPE_MODEL`)
6. **`enforceSafetyGate` in code** — not the prompt
7. Usage recorded (`chef_attempts` when service role present; in-memory in tests)

### How the allergen/dietary gate is enforced (not by prompt)

File: `lib/safety_gate.ts`

After the model returns structured JSON:

1. Resolve each recipe line / substitution against the catalog (+ pantry as catalog).
2. **`unknownAllergens: true` or unresolved free text → always unsafe** (blocked).
3. Hit if any allergen ∈ user `avoidAllergens` or flag ∈ user `avoidDietaryFlags`.
4. Secondary **name scan** of the free-text `message` against catalog names for avoid hits (catches “toss in all-purpose flour” prose).
5. Any violation → HTTP-style `safety_blocked` with `violations[]`; recipe/subs discarded.

Prompt text *also* asks the model to respect diet — that is **not** the control.

### Secrets

- `OPENROUTER_API_KEY` from function secrets only.
- Never `VITE_`-prefixed; client only has Supabase URL + anon key.

### Capabilities

- `what_can_i_make` — grounded pantry IDs returned for UI chips  
- `substitute` — structured ratios  
- `generate_recipe` — full `ChefGeneratedRecipe` (client can save as `Recipe`)  
- `cooking_qa` / `chat`

---

## Task 3 — Chat UI

- Route: **`/chef`** → `ChefPage` → `ChefScreen`
- Free users: clear upsell card + link to free cook-now on Home (not a blank error)
- Paid: chat, suggested empty-state prompts, **“Grounded in your pantry”** chips from `groundedPantry`
- Dietary profile from localStorage (`tgp.avoidAllergens`, `tgp.avoidDietaryFlags`) until profile UI ships
- Entitlement: session `plan` metadata, or dev `localStorage.tgp.plan = 'paid'` / `VITE_CHEF_PAID=true`
- Streaming: request field accepted; UI is request/response (streaming deferred — JSON schema responses are easier to gate post-hoc)

---

## Deviations

1. **No SSE streaming UI** yet — gate needs full JSON; can add token stream later with a second pass or tool-calls.
2. **Recipe save** — model returns a real `Recipe`-shaped payload; one-tap “Save to recipes” not wired (would need recipes store write; out of chef folder scope for store internals is fine if we add later).
3. **Matching / Ingredient type** required `dietaryFlags` — fixed call sites in barcode/receipt/community/grocery that construct `Ingredient` (necessary for typecheck).
4. **`src/db` not migrated** for dietary flags column (forbidden by brief).
5. Function tests: **55** total (not “39 + chef only as separate count in the 39”).

---

## Open questions

1. Should certified GF oats become a separate ingredient id so celiac users can stock them without a gluten flag?
2. Profile screen for avoid lists (vs localStorage)?
3. When does `chef_attempts` migration land (usage table assumed, not created here)?
4. RevenueCat entitlement wiring — currently `app_metadata.plan` same as receipts?
5. Save-generated-recipe CTA + matcher pass on free-text lines before insert?

---

## Files touched (high level)

**Core (granted):**  
`domain/allergens.ts`, `domain/types.ts`, seed helpers/validate/categories, matching veto, tests.

**Chef function:**  
`supabase/functions/chef/**`

**Web:**  
`apps/web/src/features/chef/**`, `routes/ChefPage.tsx`, `App.tsx` route, Ingredient mapping call sites for `dietaryFlags`.

**Report:** this file.

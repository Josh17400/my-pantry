# M3 Track B — Community recipes, URL import, cost per meal

**Date:** 2026-07-26  
**Owner paths:** `apps/web/src/features/community/**`, `import/**`, `cost/**`,  
`apps/web/src/routes/CommunityPage.tsx`, `ImportRecipePage.tsx`,  
`supabase/migrations/20260726120000_moderation.sql`

---

## Summary

| Surface | Route / module |
|--------|----------------|
| Community browse / fork / report | `/community` |
| URL + paste import | `/import` |
| Cost arithmetic | `features/cost` (pure; ready for cook UI) |
| Moderation schema | `20260726120000_moderation.sql` |

**Verification (this track):**

| Gate | Result |
|------|--------|
| `@larder/web` typecheck | Pass |
| `@larder/web` test | **206** passed (was 170; +36) |
| `@larder/core` test | **265** passed (parallel track grew from 248; all green) |
| `@larder/web` build | Pass |
| Monorepo `npm run typecheck` | **Fails in `packages/core`** — unused `flagsOf` in `test/seed/conversions.test.ts` (not this track; brief forbids editing core) |

---

## Part 1 — Community model and moderation

### Model

- Recipes already have `visibility ∈ {private, household, public}` with RLS public-read and a partial public index.
- **Publish** sets `visibility = 'public'` after gates (`canPublish`).
- **Fork** copies lines/steps into the user's household book with `visibility: 'private'` and `forkedFrom: source.id` (`buildForkedRecipe`). Never inherits public.
- Free-text / unmatched lines keep **`unknownAllergens: true`** on match failure and on fork when `ingredientId` is missing. Never assume a stranger's recipe is allergen-clear.

### Search

`searchCommunityRecipes` filters public cards by:

- free-text query (title, tags, ingredient rawText / id, author label)
- ingredient substring
- tags
- min/max total prep+cook minutes

Offline demo catalog: `demo-recipes.ts` (original short recipes, not scraped).

### Moderation (ships with the feature)

| Mechanism | Implementation |
|-----------|----------------|
| Report flow | `createReport` + `ReportStore` (memory / localStorage); UI form with reasons |
| Duplicate open reports | `canReport` blocks second open report per user×recipe |
| Publish rate limit | Sliding window **5 publishes / hour** (`PublishRateLimiter`) |
| Author profile | `buildAuthorProfile` from public recipes + optional display meta |
| Durable tables | Migration: `recipe_reports`, `author_profiles`, `recipe_publish_events` + RLS |

Report reasons: spam, copyright, unsafe, offensive, misinformation, other.

### Publish gates

1. Already public → no-op error  
2. Not author → refuse  
3. **Imported-with-source and steps not rewritten** → refuse (copyright)  
4. Optional unknown-allergen block  
5. Rate limit  

---

## Part 2 — JSON-LD coverage and locale

### Extraction pipeline

1. **JSON-LD** (`application/ld+json`) — preferred  
2. **Microdata** (`itemtype=…/Recipe`) — fallback  
3. Bare JSON object/array paste  
4. **Manual paste** when nothing structured is found (graceful, not a hard fail)

### Shapes covered (tests)

| Shape | Status |
|-------|--------|
| Single `@type: Recipe` object | ✓ |
| `@graph` with Recipe among other types | ✓ |
| Top-level JSON **array** of nodes | ✓ |
| `@type` as string **array** (`["Recipe","HowTo"]`) | ✓ |
| `HowToStep` / `HowToSection` + `itemListElement` | ✓ |
| HTML-wrapped `<script type="application/ld+json">` | ✓ |
| ISO-8601 durations (`PT1H30M`) + yield variants | ✓ |

### Shapes that still fail or are weak

- **Multi-recipe pages** — first viable Recipe wins; no picker UI yet  
- **Deeply nested CMS wrappers** beyond depth 12  
- **Microdata** is heuristic (regex over a window), not a full HTML parser — odd nesting / React hydration shells can miss props  
- **No network fetch** of URL — user pastes HTML or JSON-LD (CORS / companion-web constraint). URL field is for locale signals + provenance only  
- **recipeInstructions as pure HTML blob** without step structure may land as one giant step string  

### Locale ambiguity — how it is surfaced

`parseQuantity` flags `ambiguousLocale` on **pint, quart, gallon, fl oz, cup** (US ≠ Imperial; e.g. UK pint 568 ml vs US 473 ml ≈ 20%).

On import:

1. `findLocaleAmbiguities` scans every ingredient line.  
2. `detectSourceLocale` collects signals (TLD / host, `inLanguage`, cuisine, vocabulary) → `us` | `imperial` | `metric` | `unknown`.  
3. **Detection never auto-applies conversion factors.**  
4. If any ambiguous unit exists and the user has not chosen US vs Imperial, **`canSaveImport` blocks** with `locale_unresolved`.  
5. UI card (`data-testid="locale-prompt"`) lists affected lines and requires an explicit **US customary** or **Imperial (UK)** choice.  
6. Imperial choice records a note that the app registry is US-based so the user should review quantities — still no silent 20% error.

UK recipe test: BBC Good Food–style JSON-LD with `en-GB`, British cuisine, `1 pint whole milk` → locale `imperial`, pint ambiguity, save blocked until choice.

### Copyright stance on imports

- Import is **for the user's own book only** (`visibility: 'private'`).  
- Tags: `imported`, `has-source-url` (and `locale:…` when chosen).  
- **Never auto-publish.**  
- `canPublish` + `isPublishBlockedByCopyright` refuse public until `stepsRewritten` / tag `steps-rewritten`.  
- Copy in UI: steps and photos are copyrighted; ingredient lists alone are not a free pass to republish prose.

---

## Part 3 — Cost methodology and incompleteness

### Inputs

- Cook deductions: relative `reason: 'cook'`, `refId = cookEventId` (matches `buildCookTxns`).  
- Purchases: relative `reason: 'purchase'` with optional `unitPrice` for that purchase's `deltaBase`.

### Arithmetic

```
pricePerBase = unitPrice / deltaBase   (latest purchase per ingredient+form)
lineCost     = |cook.deltaBase| × pricePerBase
meal total   = sum of priced lines only
perServing   = total / servings
```

### Honesty (no false precision)

| Situation | Presentation |
|-----------|----------------|
| All lines priced | Full `$x.xx`; `completenessLabel: null` |
| Partial | Total of priced lines + **`estimated from 6 of 9 ingredients`** |
| None priced | `totalCost: null`, UI `—`, label **No price data for any of N ingredients** |

Also: recent trend (`mealCostTrend`), most expensive recurring ingredients (`mostExpensiveRecurring`, min 2 cooks).

---

## Tests added

| File | Covers |
|------|--------|
| `community.test.ts` | search, fork + forkedFrom, publish/rate limit, **report creation**, unknownAllergens, author profile |
| `import.test.ts` | JSON-LD object / `@graph` / array, no-data manual path, **UK locale ambiguity**, copyright publish block |
| `cost.test.ts` | **partial** price data (3 of 4), complete, empty, trend, expensive recurring |

---

## Deviations

1. **No `packages/core` / `src/db` changes** (brief). Community public list offline uses demo recipes; live Supabase public browse not wired through a new repository method.  
2. **URL is not fetched server-side** — paste HTML/JSON-LD (avoids CORS and scrape liability).  
3. **Imperial choice does not recompute ml** — registry remains US; user is warned to adjust. True Imperial unit table would be a core change.  
4. **Cost UI not mounted on cook detail** — pure module + tests; screens can import `costCookEvent` when txn list APIs are exposed to the feature without expanding db ownership.  
5. **Monorepo typecheck** blocked by parallel-track core unused symbol — web typecheck clean.

---

## Open questions

1. Should web fetch recipe HTML via a small Edge Function (proxy) so “paste URL only” works without page-source paste?  
2. Who reviews `recipe_reports` — service-role dashboard later, or M4 admin?  
3. Should publish require email-verified auth even for local/dev household authors?  
4. Cost: is `unitPrice` always “price for this purchase’s `deltaBase`” (assumed here) or store unit price for qty=1? Receipt path stores line total-style unitPrice with full `deltaBase` — document if that changes.  
5. Fork of imported public recipes: should forked copies inherit the copyright publish block?

---

## File map

```
apps/web/src/features/community/   search, fork, publish, rate-limit, report, match-lines, UI
apps/web/src/features/import/      jsonld, microdata, locale, match-import, copyright, UI
apps/web/src/features/cost/        meal-cost pure arithmetic
apps/web/src/routes/CommunityPage.tsx
apps/web/src/routes/ImportRecipePage.tsx
supabase/migrations/20260726120000_moderation.sql
reports/m3-b-community.md
```

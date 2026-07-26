# M1 Track D — Ingredient matching and household de-duplication

**Candidate implementation report** · 2026-07-25  
**Scope:** `packages/core/src/matching/**`, `packages/core/src/dedupe/**`,  
`packages/core/test/matching/**`, `packages/core/test/dedupe/**`  
**Verification:** `npm run test -w @larder/core` → **219 passed** (existing + this track).  
`npm run typecheck` → blocked by **unrelated** seed track error (see Open questions).

Root barrel `packages/core/src/index.ts` was **not** edited (integration track owns it).

---

## Part 1 — Matching cascade and confidence model

### Cascade (cheapest first)

| Step | Trigger | Confidence | Auto-accept eligible? |
|---|---|---|---|
| 1. `user-alias` | Exact `aliasKey` hit on household user alias | 1.0 | Yes, unless veto |
| 2. `global-alias` | Exact `aliasKey` hit on global alias | 1.0 | Yes, unless veto |
| 3. `normalized` | Exact normalized name, or longest whole-phrase containment with only filler residuals | 1.0 | Yes, unless veto |
| 4. `fuzzy` | `0.55·trigram + 0.45·Levenshtein` ≥ **0.72** | score | **Never** |
| 5. `needs-llm` | Best fuzzy in **[0.45, 0.72)** | best score | N/A (caller may invoke LLM) |
| 6. `needs-user` | Below 0.45 or empty catalog/query | — | N/A |

**API:** `matchIngredient(input) → MatchResult` (discriminated: `match` | `needs-llm` | `needs-user` | `no-match`).  
Carries `ingredient?`, `confidence`, `step`, `autoAccept`, `vetoes[]`, `alternates[]`.  
**Never mutates** catalog, aliases, or pantry.

### Normalization

`normalizeIngredientText`: lowercase → expand receipt abbreviations (`HVY`→heavy, `CRM`→cream, `CHKN`→chicken, …) → strip `$` prices, size tokens (`16OZ`, `5lb`, …), grade tokens (`GRADE A`, `LARGE`, …) → strip brand/marketing tokens → singularize last token.

`aliasKey`: lighter key for exact alias lookup (abbrev expand + lowercase; no brand strip) so user-typed aliases still hit.

### Fuzzy score

Hand-rolled (no new deps): character-trigram Jaccard + normalized Levenshtein.  
Constants: `FUZZY_CONFIDENCE_FLOOR = 0.72`, `LLM_BAND_LOW = 0.45`, `AMBIGUITY_GAP = 0.05`.

### Tie-breaks (deterministic)

1. Higher confidence first  
2. Lexicographic `ingredient.id`  
3. Lexicographic `ingredient.name`  

Same inputs → same ranking (asserted in tests).

### Containment rule (normalized step)

A shorter name may match a longer receipt string only when residual tokens are in a fixed **filler** set (`long`, `grain`, `yellow`, `thick`, `cut`, …).  
`hevy cream` does **not** normalize-match plain `cream` (`hevy` is not filler) → falls to fuzzy + sibling exclusion.

---

## Guards — enforcement

### 1. Sibling exclusion

- Catalog may supply `taxonomyParentByIngredientId`.
- Default families cover cream, stock/broth, milk, butter, flour, sugar, oil, hard cheese (`DEFAULT_SIBLING_FAMILIES`).
- On **fuzzy** matches, if the candidate shares a parent with any other catalog ingredient → veto `sibling-exclusion`, `autoAccept = false`.
- Spec examples enforced by tests: cream / sour cream / heavy cream / cream cheese; stock / broth / stock cube.

### 2. Receipt path — fuzzy never auto-accepts

- `path: 'receipt'` + `step: 'fuzzy'` → veto `receipt-fuzzy`.
- Additionally, **all** fuzzy results hard-set `autoAccept = false` (exact / learned / global / normalized-exact only for silent accept).
- Learned/global/normalized exact still auto-accept on receipt when no other veto.

### 3. Allergen veto

- Optional `queryAllergens: AllergenTags` on input.
- Candidate tags = `knownAllergens(ingredient.allergens)`.
- Uses domain `canAutoMergeAllergens` / `allergensDisagree`.
- Disagree **or either unknown** → veto `allergen`, `autoAccept = false`.
- **No confidence score overrides this** (tested at confidence 1.0 on alias + normalized paths).

### 4. No automatic global promotion

- `createPromotionCandidate` always sets `autoApplied: false`.
- `shouldAutoPromote` always returns `false`.
- `evaluatePromotion` promotes only when:
  - `independentHouseholdCount ≥ 5` (`MIN_HOUSEHOLDS_FOR_PROMOTION`)
  - `curated === true`
  - `disagreementRate ≤ 0.15`
- Majority alone → `queue` or `reject`, never `promote`.

---

## Fixture suite — false-positive rate

**Location:** `test/matching/fixtures.ts` + `fixtures.test.ts`

| Metric | Value |
|---|---|
| Cases | 32 (20 positive, 12 near-miss negatives) |
| **False-positive rate** | **0 / 32 = 0.00%** |
| **Threshold (failing)** | **5.0%** (`FALSE_POSITIVE_RATE_THRESHOLD`) |
| Gate | `expect(rate).toBeLessThanOrEqual(0.05)` — release gate, printed in test stdout |

**FP definition used:** auto-accept onto a forbidden near-miss id (negatives), or auto-accept onto the wrong id (positives). Non-auto fuzzy/LLM/user outcomes are **not** false positives.

Near-miss negatives include: `HVY CRM 16OZ` ↛ plain cream; `CHKN BRTH` ↛ stock cube; cream-cheese / sour-cream / half-and-half sibling traps; almond butter ↛ peanut butter; beef broth ↛ chicken broth.

---

## Part 2 — De-duplication

Pure decision functions; **never write transactions**.

### Cook de-dupe — `findDuplicateCook`

| Choice | Value | Reasoning |
|---|---|---|
| Window | **3 hours** (`DEFAULT_COOK_WINDOW_MS`) | SPEC default; covers “partner logs the same dinner” without collapsing next-day leftovers cooks |
| Key | `recipeId` | Same meal intent; not ingredient-level |
| Hit | Most recent prior in window (min \|Δt\|; tie-break `cookEventId`) | UI copy: “Alex logged this 20 minutes ago…” |
| Default action | **`merge`** | SPEC: merge is the default; separate batch is the alternate |

Boundary tests: exactly 3h = hit; 3h+1ms = miss; different recipe = miss. Injected `now` for testability.

### Receipt de-dupe — `receiptFingerprint` + `checkReceiptDuplicate`

**Fingerprint:** FNV-1a of `normalizeStore × YYYY-MM-DD × totalCents × lineCount`.

**Exact** → `block`.

**Near** (all must hold) → `warn`:

1. Fingerprints differ  
2. Same normalized store  
3. Calendar `|dayDiff| ≤ 7` (boundary: **7 = near, 8 = ok**)  
4. Close totals/lines:  
   - same total **and** `|lineCountDiff| ≤ 1`, **or**  
   - same lineCount **and** `|totalDiffCents| ≤ 100` ($1.00; boundary: $1.00 near, $1.01 ok)

Different store or outside slop → `ok`.

### Trip reconciliation — `reconcileTrip`

Given `shoppingTripId` + check-off lines + receipt lines:

| Status | Meaning | Pantry commit |
|---|---|---|
| `match` | Both paths | **Receipt qty only** (never sum) — provenance `reconciled` |
| `extra` | Receipt only | Receipt qty — `receipt-only` |
| `missing` | Check-off only | Check-off qty — `checkoff-only` |

Merge key: `ingredientId + formId`. Same-path duplicate lines aggregate before reconcile.  
**Same bag of rice on check-off + receipt lands once.**

---

## Module layout

```
packages/core/src/matching/
  types.ts, normalize.ts, string-sim.ts, siblings.ts,
  match.ts, promote.ts, index.ts

packages/core/src/dedupe/
  types.ts, cook.ts, receipt.ts, trip.ts, index.ts

packages/core/test/matching/
  fixtures.ts, fixtures.test.ts, match.test.ts, promote.test.ts

packages/core/test/dedupe/
  cook.test.ts, receipt.test.ts, trip.test.ts
```

Domain types (`Ingredient`, `AllergenTags`, helpers) imported from `src/domain/` — not re-declared.

---

## Deviations

1. **Root barrel not wired** — per brief; callers import from `@larder/core/matching` paths or wait for integration track.
2. **LLM step is a stub outcome** — returns `needs-llm` with ranked candidates; no network call (out of scope).
3. **Fuzzy auto-accept is always false** (all paths), not only receipt — stronger than the minimum “receipt path” rule; still allows exact/learned/global/normalized silent accept.
4. **Containment filler list** is heuristic; receipt strings with unusual descriptors may fall to fuzzy/LLM more often (safe, more taps).
5. **Promotion `promote` action** is advisory for a future curation worker — this module still never writes the global table.

---

## Open questions (not guessed)

1. **Workspace typecheck red from seed track:**  
   `packages/core/src/seed/categories/canned.ts(7,36): 'simpleVolume' is declared but its value is never read.`  
   Out of scope for Track D; seed track should drop the unused import. Matching/dedupe themselves typecheck clean under the same `tsc` project once that is fixed.
2. **Should normalized containment of sibling heads (e.g. query `heavy cream xtra` with residual non-filler) force `needs-user` even when fuzzy ranks a sibling?** Currently residual non-filler → fuzzy → sibling veto, no auto-accept — OK for safety; UX for ranking order TBD with real OCR corpus.
3. **Cook window per recipe vs global?** SPEC is per-`recipeId` within 3h; no cross-recipe “same meal” de-dupe (two recipes same night still both deduct). Confirm if meal-level intent ids arrive in M2.
4. **Receipt near-match on tax-only total drift > $1** common at warehouse clubs — may need store-specific slop later; not changed without data.
5. **Allergen query tags on pure OCR lines** are often absent; without `queryAllergens`, allergen veto is inactive (candidate tags alone cannot disagree). Confirm M2 receipt pipeline always attaches tags when known from UPC/prior match.

---

## Test inventory (this track)

| Area | Coverage |
|---|---|
| Cascade order | user > global > normalized |
| Sibling exclusion | cream family, stock/broth |
| Receipt fuzzy | never auto-accept; learned still can |
| Allergen veto | disagree, unknown, peanut≠tree_nut at conf 1.0 |
| Normalization | brand/size/grade, singularize, abbrev |
| Promotion | never auto-applied; N+curation gate |
| Fixtures + FP rate | 0% ≤ 5% gate |
| Cook de-dupe | in/out window, boundaries, inject now |
| Receipt FP | exact / near day 7–8 / $1 boundary / store |
| Trip reconcile | match once, extra, missing, all three paths |

**Total workspace tests after this track: 219 green.**

# My Pantry — Pantry / Recipe / Grocery App

**SPEC v2** — revised 2026-07-25 after adversarial red-team (`reports/redteam.md`).
This document is the design authority. Every Grok brief is written from it.

---

## Context

Greenfield at `C:\Users\joshu\Documents\Larder`.

> **Naming:** the product is **My Pantry**. `Larder` was the working name and survives only as
> the folder name and in the concept mockups' wordmark. The directory rename is deferred until
> M0 finishes — a Grok instance is currently bound to that path. `app.json` display name,
> the wordmark, and all user-facing copy use **My Pantry**.

The problem: you're standing in a grocery store thinking *"I want to make chicken parm — do I already have parmesan?"* and you have no way to know. Pantry apps fail because keeping inventory accurate is manual drudgery. This app's bet is that the pantry maintains itself, because the two events that change it are things you already do: you buy groceries (photograph the receipt) and you cook (tap the recipe).

### What "accurate" honestly means

The red-team's central finding (C3) stands and must not be papered over: receipt-in / recipe-out captures only *two* classes of event. A kid eats yogurt, a partner takes leftovers, you cook from memory, a guest brings cheese, herbs come from the garden. Inventory *will* drift.

But drift is not uniform, and this is the insight the product is built on:

> **Drift is worst on high-churn staples — milk, eggs, bread — which are exactly the items you already know the answer to without opening the app. Drift is mildest on the occasional-use long tail — parmesan, capers, tahini, gochujang — which is exactly what you cannot remember and exactly why you opened the app.**

The app is most accurate precisely where it is most useful. We do not need perfect inventory to win; we need the long tail right and the staples approximately right.

**Consequence — the trust layer is mandatory, not polish.** The owner has chosen precise quantity tracking for *all* items (not the coarse/adaptive alternative). That is the design. To keep confident-looking numbers from becoming lies, every quantity carries visible **provenance**:

```
parmesan   113 g   ✓ receipt · 2 days ago
flour     1.8 kg   ⚠ 3 cooks since last verified
olive oil  412 ml  ⚠ estimated · never verified
```

A drifted number must *look* drifted. Never render false precision without its confidence.

---

## Decisions locked

| Decision | Choice |
|---|---|
| Platform | **React + Vite + Capacitor** — a web app wrapped natively for iOS + Android |
| **Web role** | **Online companion only.** No local SQLite on web. See below. |
| Language | TypeScript `strict` |
| Backend | Supabase from day one (Postgres + RLS + Auth + Storage + Edge Functions) |
| Local data | Offline-first SQLite via Drizzle, **native only** |
| **Precision** | **Precise quantities for all items** + mandatory provenance/confidence display |
| **Household** | **Multi-user from M1.** `householdId` on every row; de-dupe designed in, not retrofitted |
| Receipt scan | Photo → cheap vision LLM via OpenRouter → structured line items |
| Sequencing | Core loop (M1) → receipts (M2) → community + AI (M3) → monetization (M4) |

### Why Capacitor, not Expo *(revised 2026-07-26)*

The project was scaffolded on Expo SDK 57 and then re-platformed. The reason: **Expo Go for SDK 57 was not on the App Store** (Expo's changelog: *"waiting on approval"*), so device verification was impossible, and Expo's workaround — `eas go` — means building a custom Expo Go and shipping it through TestFlight.

Meanwhile the owner **already runs a proven, debugged, Mac-free iOS pipeline** for another shipped app (`~/euchre-game`): Capacitor → GitHub Actions on `macos-26` → fastlane → cloud signing via an App Store Connect API key → TestFlight. It already includes `@capacitor-community/admob` and `@revenuecat/purchases-capacitor`, which are exactly the M4 monetization dependencies.

Switching cost was near zero because **`packages/core` is framework-agnostic**: 248 tests of pure TypeScript with no React and no platform APIs. Only the shell moved. That property was a deliberate architectural choice from M0 and it paid for itself immediately — worth preserving.

### Why web is a companion

Native gets offline-first SQLite; **web reads Supabase directly**. Same codebase, same routes, same components. Web can browse recipes, check the pantry, and work the grocery list; it just needs a connection. The offline case that actually matters is the grocery store, and you're holding your phone there.

*Open:* `@capacitor-community/sqlite` ships a `jeep-sqlite` wasm web implementation. If it works **without** origin-wide COOP/COEP headers (the requirement that made the Expo web path untenable, since those headers break OAuth popups, AdSense, and Stripe.js), it gets wired as a **development-only** driver so the DB can be exercised in a browser. Being resolved with evidence during the re-platform — not assumed.

---

## Architecture

```
Larder/
  packages/
    core/                  ← pure TS. ZERO React, ZERO platform APIs.
      src/units/           unit registry, forms, conversion graph
      src/pantry/          ledger fold, projection, par levels, provenance
      src/recipes/         scaling, cook planning, shortfall
      src/matching/        name → canonical ingredient (+ allergen guard)
      src/grocery/         list generation, aggregation, trip reconciliation
      src/dedupe/          cook + receipt + trip de-duplication
      src/seed/            canonical ingredients, forms, conversions (JSON)
      test/                vitest — correctness is proven HERE
  apps/mobile/             Expo app (expo-router) — the only React code
    src/db/                Drizzle schema + repository interface
      drivers/native.ts    expo-sqlite
      drivers/web.ts       Supabase-direct + SW cache (NOT sqlite-wasm)
    src/sync/              ledger push/pull
    src/ui/                components
  supabase/
    migrations/            schema + RLS
    functions/             parse-receipt · chef · entitlements
```

`packages/core` is platform-free and mirrors the proven `combat-sim` / `economy-sim` pattern. Everything that can be *wrong* lives there and is tested without an emulator.

### Stack

**React 19 + Vite + TypeScript `strict`** · **Tailwind CSS** (`DESIGN.md` is written for it) · **Capacitor 8.x** (versions mirrored from `~/euchre-game/native/package.json`) · **Drizzle** over `@capacitor-community/sqlite` via `drizzle-orm/sqlite-proxy` (no official Capacitor driver exists; the proxy takes an async executor and fits cleanly) · `@supabase/supabase-js` · Zustand · TanStack Query · **Vitest**.

M4 monetization is already proven on this stack in the owner's other app: `@capacitor-community/admob` and `@revenuecat/purchases-capacitor`.

---

## Data model

### Units — dimensions are not enough; **form** is a first-class axis

Three base dimensions (`MASS→g`, `VOLUME→ml`, `COUNT→each`) are necessary but insufficient. "3 cloves garlic" vs a jar of minced vs garlic powder are the same ingredient in incompatible forms. One `densityGPerMl` per ingredient is a fiction — scooped vs sifted flour differs by 20%+.

```ts
Ingredient      { id, name, category, allergens[], isStaple, defaultFormId }
IngredientForm  { id, ingredientId, form,        // whole|clove|minced|powder|shredded|slice…
                  dim, densityGPerMl?, gramsPerCount?, uncertaintyPct }
ConversionEdge  { fromFormId, toFormId, factor, uncertaintyPct, source }
PackageSpec     { formId, label,                 // "can_14_5oz"
                  netG, drainedG? }
```

**Conversion is a graph traversal along declared edges, never a global scalar.** No edge → no conversion → fail loudly. Cross-form deduction above an uncertainty threshold requires confirmation in the cook preview; it never happens silently.

Stocking unit (what you buy) is separate from recipe unit (what you use). "To taste" and pinch-scale amounts are non-quantified and do not deduct — gram theater on salt is worse than tracking nothing.

### Allergens are a safety system, not a preference field

Canonical allergen tags on every ingredient. **Matching refuses to auto-merge across disagreeing allergen tags** — no confidence score overrides this. Unmatched free-text recipe lines carry `unknownAllergens: true`, and both the recipe view and the AI chef must treat unknown as *unsafe*, never as clear. This is liability surface, not polish, and it lands in M1's model.

### The ledger — two event kinds, not one

The v1 claim that an append-only log "merges by union, no conflict UI" was **wrong**. It holds only for *relative* deltas. Absolute writes do not commute:

> Both phones offline at 1000 g flour. A recounts to 500 (Δ−500). B recounts to 800 (Δ−200). Union → **300 g**, which neither person believes.

```ts
PantryTxn {
  id, clientTxnId, householdId, ingredientId, formId,
  kind: 'relative' | 'absolute',
  // relative:
  deltaBase?,        // purchase | cook | quick | waste | adjust_delta
  // absolute:
  targetBase?,       // recount / set_qty
  basisCursor?,      // max txn cursor this device had seen
  reason, refId?, unitPrice?,
  occurredAt,        // client clock
  acceptedAt,        // server clock — LWW uses this, not client time
  deviceId, userId
}
```

**Merge rule — a deterministic fold, per ingredient:**

1. Total-order the household's txns by `(occurredAt, deviceId, clientTxnId)`.
2. Fold: `relative` → `acc += delta`. `absolute` → `acc = targetBase`, discarding everything prior.
3. Concurrent absolutes: later in total order wins; both are retained and the UI surfaces the conflict **once** ("two recounts disagreed — 800 g kept").

This never produces the 300 g nobody believes, and it is reproducible on every device.

**Absolute events double as checkpoints.** Re-folding an ingredient only needs to walk back to its last absolute, which bounds the cost. The projection is a *cache*: maintained incrementally, but **re-folded whenever a merge inserts a txn at or below the local watermark, or inserts any absolute**. Incremental `qty += delta` in arrival order is wrong under out-of-order sync and must never be the only path.

Invariant, enforced by test: **projection == fold(log) after any merge sequence.**

### De-duplication — union is right for a bank, wrong for a pantry

Two people log the same dinner and the ingredients deduct twice. `clientTxnId` only stops same-*device* replay. Household-scoped de-dupe is M1 work:

- **Cook** — on commit, scan the household log for the same `recipeId` within 3h. Found → *"Alex logged this 20 minutes ago — merge, or is this a separate batch?"* Merge is the default.
- **Receipt** — fingerprint `hash(store, date, total, lineCount)`. Exact match blocks; near-match within 7 days warns.
- **Trip** — `shoppingTripId` links grocery-list check-off to the receipt commit, so the same bag of rice arriving by both paths **reconciles instead of summing**.

### Remaining entities

```ts
// Locations are user-defined, not an enum (see DESIGN.md — the mockups show
// Fridge / Pantry / Around the House, with the last expanding into Spices,
// Tea & Coffee, Baking, Household). Seeded with defaults, fully editable,
// one level of nesting. Also closes the "cabin / office fridge" red-team item.
Location   { id, householdId, name, icon, tint, parentId?, sortOrder }

PantryItem { householdId, ingredientId, formId, locationId,
             qtyBase, dim, parLevelBase, lowThresholdPct,
             lastVerifiedAt, unverifiedCookCount,   // ← provenance
             openedAt?, expiresAt?, updatedAt }

Recipe     { id, householdId?, title, servings, yieldNote, prepMin, cookMin,
             ingredients: [{ ingredientId?, formId?, rawText, qty, unit,
                             optional, group, substitutes[], unknownAllergens }],
             steps: [{ text, durationSec?, timerLabel? }],
             authorId, visibility, forkedFrom?, tags[], imageUrl? }
```

### Indexes (specified now, not discovered at 50k rows)

`pantry_txn(household_id, client_txn_id) UNIQUE` · `(household_id, ingredient_id, occurred_at)` · `(household_id, accepted_at)` for the pull cursor. Recipe search via FTS locally, server-side for community. Never load full transaction history into the UI — page it. Virtualized lists (FlashList) for pantry and community.

---

## Key algorithms — all in `packages/core`, all vitest-covered

**Conversion** — graph traversal across form edges. Returns `{ok:true, value, uncertaintyPct}` or `{ok:false, reason}`. Never guesses. On failure the UI asks once and caches the answer as a user-scoped edge.

**Low / out** — "percentage remaining" needs a baseline, which is the **par level**: seeded from `PackageSpec`, then learned from purchase history. Red-team M3 corrections applied: par is a function of median purchase quantity *and* time-between-purchases *and* seasonal category, with a user override; purchases more than ~4 months apart don't feed learning without a seasonal tag (or turkey reads LOW in March). `OUT` at `qty <= epsilon`; `LOW` at `qty/par <= threshold`.

**Notifications are batched, never per-item.** Ten items going LOW after one cook must produce one daily shopping brief, not ten pushes. A notification storm gets alerts disabled, which kills the whole par system. Rate cap and quiet hours are part of the feature, not a setting we add later.

**Cook planning** — scales by servings, converts each line into the pantry's form, returns `{needBase, haveBase, shortfall, convertible, uncertaintyPct}`. Always a preview, never a silent subtract; editable before commit. All txns commit under one `cookEventId` so the whole meal undoes as a unit. Going negative prompts *"still have some?"* rather than silently clamping — that recovers reality better than either clamping or hidden negatives.

**Matching** — learned alias → global alias → normalized → fuzzy → LLM → ask user. Hardened per red-team M2:

- **Sibling exclusion.** *cream* / *sour cream* / *heavy cream* / *cream cheese* are co-hyponyms with high trigram overlap and genuinely different behavior. Candidates sharing a taxonomic parent **never auto-accept** on fuzzy — they require exact, learned, or LLM disambiguation.
- **Fuzzy never auto-accepts** on the receipt path. High-confidence auto-accept is limited to exact / learned / global-exact hits. Fuzzy is always at least one tap.
- **No automatic global promotion.** User aliases stay user-scoped. Promotion to the global table requires N independent households plus a curation queue — majority-vote promotion is a table-poisoning vector.
- Fixture suite includes **adversarial near-miss pairs**, and false-positive rate is a tracked release gate, not a vibe.

---

## Feature pipelines

### Receipt → pantry (M2)

Capture → **grocery-likelihood pre-check** (don't burn a scan parsing a Home Depot receipt) → Edge Function → vision model with strict JSON schema → match → review → commit.

The red-team's core warning: a 40-line Costco receipt at one confirmation per line is **80–120 taps**. That is not a wow feature, it's data entry. So the review screen is built around **bulk actions** — accept all high-confidence, apply defaults to a whole category, dismiss all non-food in one tap — with individual review as the exception path. Warehouse-store item codes route to barcode-at-put-away instead.

Quota is charged **on commit, not on parse**, so a failed OCR doesn't cost the user a scan. Budget is enforced server-side by **dollars/tokens, not just scan count** (red-team M6 — a 40-line multi-photo receipt is not the same cost as a corner-store receipt, and unit economics must use p95, not best case).

Privacy: **parse and discard by default.** Receipts carry card last-4, store address, and loyalty IDs. Opt-in retention only, private bucket, owner-only RLS, 30-day purge. Disclosed in store privacy labels regardless, since processing still occurs.

### Grocery list (M1)

Manual adds + low/out + recipe shortfalls + reorder cadence, merged. Same ingredient across recipes aggregates to one line in purchase units ("2 lb ground beef", not "907 g"). Aisle-grouped, offline-safe, and tied to a `shoppingTripId` that reconciles against the receipt.

Favorites are **derived**, not curated: purchase count and median days-between-purchase yield *"you usually buy milk every 7 days — last bought 8 days ago."*

### Quick items (M1)

One-tap tiles for non-recipe eating. Deliberately not modeled as one-ingredient recipes — it has to be one tap from home, not three.

### Community + catalog (M3)

Supabase RLS public-read on `visibility='public'`. Search by ingredient, tag, time. Save/fork; imported free text runs the matcher and inherits `unknownAllergens` where it fails.

> ⚖️ **The built-in catalog must be originally written or licensed.** Ingredient lists aren't copyrightable; prose, steps, and photos absolutely are. Scraping Allrecipes/NYT is a lawsuit and a store takedown. ~50 original recipes, authored for us.

Moderation, report flow, publish rate limits, and author profiles ship *with* the feature.

### Barcode / Open Food Facts (M2) — licensing constrained

Red-team M8 corrected my "free, no API key" claim. OFF is **ODbL share-alike** with attribution, 15 product reads/min/IP, and a required custom User-Agent. Folding OFF data into a proprietary matching database can trigger share-alike **on the derivative**.

Therefore: OFF-derived rows stay **segregated and tagged**, never merged into our canonical seed; attribution ships in-app; bulk needs go through the daily dump, not API scraping. If legal review says the segregation is insufficient, barcode lookup gets cut rather than opening our matching DB.

### AI chef (M3, paid)

Edge Function → OpenRouter, entitlement-gated, rate-limited, with a **dollar** budget per user. Pantry snapshot + dietary profile + current recipe as context. Plans meals, substitutes, guides cooking, and generates recipes that save as real `Recipe` rows so they cook and deduct like any other.

**Hard allergen gate:** the chef may not recommend anything containing a user's flagged allergen, and must treat `unknownAllergens` lines as unsafe. No confidence threshold overrides this.

**The API key lives only in the Edge Function.** A key in a React Native bundle is extracted in minutes.

---

## Milestones

Review gate at each boundary: I read the diffs and run verification before it counts as done. ∥ tracks run as parallel Grok instances.

### M0 — Foundation *(in flight)*

Monorepo, Expo boot on 3 targets, **SQLite proven on native**, repository interface, `packages/core` + vitest, CI. Web driver is now Supabase-direct — sqlite-wasm is **out of scope**.
Handoff blocked on owner: Supabase project URL + anon key.

### M1 — Core loop *(the milestone that makes it usable daily)*

| ∥ | Content |
|---|---|
| A | `core/units` — forms, conversion graph, uncertainty. Heavy vitest. |
| B | `core/pantry` — two-kind ledger, deterministic fold, projection cache + re-fold, par levels, provenance |
| C | `core/recipes` + `core/grocery` — scaling, cook planning, aggregation, trip reconciliation |
| D | `core/matching` + `core/dedupe` — cascade with sibling exclusion, allergen guard, cook/receipt/trip de-dupe |
| E | Seed data — ~300 ingredients with forms, conversion edges, allergens, package specs, shelf lives |
| F | UI shell — routing, design system, pantry list + detail with provenance display |

Then sequentially: recipe CRUD → cook preview/deduct → grocery list → quick items → low/out + batched brief → **expiration tracking** → **cook-now matching** → household sync.

Two features promoted into M1 by the approved designs (see `DESIGN.md`):

- **Expiration** — every mockup puts "expires in 5 days" and freshness bars on the *home screen*, and drives "use up: spinach, garlic, parmesan" from them. It is the emotional core of the home view, not an M2 add-on.
- **Cook-now matching** — *"Make something amazing — you have everything for 6 recipes."* This is `planCook()` inverted across the recipe set: pure deterministic core logic, offline, **free tier**. It must never be confused with or gated behind the paid AI chef.

**Exit:** add groceries, add a recipe, tap "I made this", watch it decrement correctly, get flagged when low, see what's expiring, see what you can cook right now, build a list from it. Offline. On your phone. Two phones in one household without double-deducting.

### M2 — Receipts and barcode
Edge Function + vision ∥ bulk-action review UI ∥ barcode + OFF (licensing-segregated) ∥ cooking mode.
**Exit:** photograph a real receipt from your real store; pantry correct afterward in a *reasonable number of taps* — tap count is an explicit metric.

### M3 — Community, AI, cost
Community browse/publish/fork + moderation ∥ AI chef + allergen gate ∥ URL import (schema.org JSON-LD) ∥ cost-per-meal ∥ 50 original recipes.

### M4 — Monetization and launch
AdMob/AdSense + UMP + ATT ∥ RevenueCat (**web billing is now mature — unify entitlements there rather than splitting RC-native / Stripe-web**) ∥ paywall ∥ privacy policy, deletion, export ∥ store submission.

> AdMob policy: banners must not sit adjacent to interactive controls. **A sticky banner above a bottom tab bar is a classic accidental-click violation** — the ad slot must be separated from navigation. No ads in cooking mode.

---

## Freemium boundary

Free must be a genuinely good pantry app; word-of-mouth is the only distribution this gets.

| Free | Paid |
|---|---|
| Unlimited pantry, recipes, lists | Everything free, plus: |
| Cook-to-deduct, low/out, quick items | AI chef |
| Community browsing | Unlimited receipt scans |
| 15 receipt scans/mo *(number is a guess — set it from M2 data)* | No ads |
| Banner ad | Household sharing, meal planner, cost analytics |

Economics use **p95 cost, not best case**: Flash-class vision runs ~$0.0005–0.003 for a short receipt, but multi-photo warehouse receipts, retries, and OpenRouter's credit overhead all push the tail up. Server-side dollar circuit breaker, not just a scan counter.

---

## Open items

**Owner decisions still outstanding:** measurement display default (US retail vs metric — assuming US, metric base) · who may recount in a household / roles · negative-stock policy confirmation (currently: prompt, don't clamp) · appetite for OFF share-alike vs cutting barcode.

**Carried from red-team, unresolved:** device clock skew makes `occurredAt` untrustworthy for ordering — mitigated by server `acceptedAt`, but skew still affects the fold's total order · soft-delete/tombstones for ingredients with historical txns · returns/refunds as reverse purchases · garden produce, gifts, meal kits, restaurant leftovers have no intake path · recipe LWW edits while someone is mid-cook · free-scan abuse via multiple accounts.

---

## Verification

**`packages/core` (vitest) — where correctness actually lives:**
- conversion: graph traversal, missing edges **fail loudly**, uncertainty propagates, no silent cross-form approximation
- ledger: **`projection == fold(log)` after arbitrary merge sequences** — including out-of-order arrival, duplicate `clientTxnId`, and concurrent absolutes; the 1000/500/800 flour case is a named regression test
- de-dupe: double cook, double receipt, list-checkoff-plus-receipt all converge to single-count
- cook planning: fractional servings, missing/optional ingredients, substitution groups, negative-stock prompt
- matching: adversarial near-miss fixtures (cream family, stock/broth) with **false-positive rate as a release gate**; allergen guard cannot be overridden by confidence
- par levels: cold start, seasonal, bulk, alternating package sizes; notification batching respects rate cap

**App:** `tsc --noEmit` + lint clean; boots iOS/Android/web; native SQLite health check passes.

**Manual per milestone:** M1 — add → cook → decrement → low flag → list, offline, on the iPhone, **plus two-phone double-cook**. M2 — real receipt from a real store, tap count recorded. M3 — cross-account publish/browse; chef refuses a flagged allergen. M4 — ad in safe area away from nav; sandbox purchase flips entitlement.

Nothing touches real payment rails before M4; sandbox throughout.

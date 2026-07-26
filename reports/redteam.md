# Larder Spec — Adversarial Red-Team Report

*Date: 2026-07-25 · Analysis only · Source: `SPEC.md` (full read) + external fact checks*

---

## Verdict

This design is **not sound enough to build M1 on without material revisions**. The unit model, the ledger “union is conflict-free” claim, and the retention bet are all load-bearing and all broken under realistic household use. The single biggest risk is not Expo web or OCR cost — it is **structural inventory drift**: the product promises a “live accurate pantry” while the only automated inputs (receipt photo + recipe cook) miss most of the events that actually change a kitchen, and the sync model *amplifies* double-entry errors that households will produce. Ship the core loop as designed and you will get the same two-week graveyard every pantry app has. Fix the multi-device truth model and the honesty of what “accurate” means *before* writing feature code; treat receipt OCR and SQLite-on-web as engineering risks, not product bets.

---

## Critical — will break the product if not fixed before M1

### C1. `recount` (and any absolute correction) secretly destroys the “append-only union is conflict-free” property

**What breaks:** The spec asserts sync is “nearly free” because an append-only log merges by *union*, with `clientTxnId` idempotency, and “two phones cooking and shopping simultaneously cannot corrupt each other.” That is true only for pure *relative* deltas. A `recount` (and the “snap to reality with an adjust txn” language in the gaps section) is an *absolute* write. Absolute writes are not commutative with concurrent deltas.

**Concrete failure scenario:**  
Flour projection starts at 1000 g on both phones (synced).  
- Phone A (offline): recounts flour to **500 g**. Client writes `recount` as `deltaBase = 500 − 1000 = −500` (the only way to express “set to 500” if the ledger is pure deltas).  
- Phone B (offline, still believes 1000 g): cooks a recipe using **200 g** flour → `deltaBase = −200`.  
Both reconnect and union the logs: total delta = −700 → projection = **300 g**. Reality after A’s recount and B’s cook is **300 g only if A’s recount was wrong about B’s cook**; if A physically measured 500 g *after* B already took 200 g at home without logging, reality is 300 g and the merge luckily matches — but if A measured 500 g of *remaining* flour while B’s cook had not yet happened in the physical world, or if recount meant “I just poured a full bag and set stock to 500,” the merge is nonsense. Worse: two offline recounts to different targets both emit deltas relative to *local* projections; union does not produce either target. Example: both start 1000; A recounts to 500 (Δ−500); B recounts to 800 (Δ−200); union → 300 g, which neither person believes.

**Recommended fix:**  
1. Define two event kinds with different merge semantics:  
   - **Relative** (`purchase`, `cook`, `quick`, `waste`, `adjust_delta`): pure CRDT-friendly sum.  
   - **Absolute** (`set_qty` / recount): store `targetBase`, `observedAt`, `basisProjectionVersion` or `basisClientSeenMaxTxnId`, and a device/user authority. Merge rule must be explicit (e.g. last-writer-wins on `occurredAt` for absolute sets *within an ingredient*, with all relative txns *after* that absolute’s clock applied on top — or reject concurrent absolutes and force a conflict UI).  
2. Stop claiming “no conflict UI.” Household + recount *requires* conflict policy or conflict UI.  
3. Materialized projection = fold of ordered log under the documented merge rules; add a server-side checksum of projection vs rebuild nightly.

**Cost now vs later:** Now: a week of domain design + tests in `packages/core`. Later: silent household data corruption, “sync is broken” 1-star reviews, and a ledger rewrite that invalidates every client already in the field.

---

### C2. Double-entry of the same real-world event is treated as two truths (the household killer)

**What breaks:** Union of logs correctly records two cook txns or two purchase txns. Correct for a bank ledger. Wrong for a pantry. The product’s value prop is physical inventory accuracy, not audit completeness.

**Concrete failure scenarios:**  
1. **Double cook:** Two phones, same household, both offline. One person cooked spaghetti. Partner A taps “I made this” on phone A; partner B (thinking they should log it, or not knowing A did) taps the same recipe on phone B. Reconnect → ingredients deducted **twice**. Pantry shows empty pasta/sauce when a full box remains. Trust dies in one dinner.  
2. **Double receipt:** Both scan the same Costco receipt “to be helpful.” Inventory doubles. Low-stock disappears; grocery list goes silent; next week they buy nothing and actually run out.  
3. **Cook + manual grocery check-off + receipt:** Spec allows “add checked items to pantry” *and* receipt scan. Same trip can land three purchase paths for the same bag of rice.

There is **no** `cookEventId` / receipt fingerprint / household de-dupe story across devices. `clientTxnId` only prevents the *same device* replaying the same write.

**Recommended fix:**  
- **Cook de-dupe:** household-scoped `cookIntentId` or soft de-dupe window (“someone already cooked Spaghetti Bolognese in the last 2 hours — merge or undo?”). Default UX: one cook confirmation is shared; second device sees “Already logged by Alex — undo?” not a silent second deduct.  
- **Receipt de-dupe:** hash of store + date + total + line count (and/or image perceptual hash); block or warn on near-duplicate within N days.  
- **Single “trip” object:** grocery list check-off and receipt commit attach to the same `shoppingTripId`; second path becomes reconcile, not second sum.  
- Accept that **perfect automation without coordination UX is impossible** for multi-user pantries.

**Cost now vs later:** Now: data model fields + one conflict/confirm screen pattern in M1 sync design. Later: the entire retention thesis fails for the primary multi-phone household persona the spec itself calls “the normal case” (M3 household).

---

### C3. The accuracy bet is false for real kitchens — retention will still die

**What breaks:** The core product sentence is “the pantry stays accurate on its own.” Receipt-in / recipe-out + recount does **not** close the event set. Every pantry app dies when displayed inventory ≠ reality; this design only automates *two* of many event classes.

**Concrete failure scenario (honest day in a real house):**  
Morning: kid eats two yogurts (no recipe, no quick-tile if yogurt wasn’t pinned).  
Lunch: partner grabs leftover takeout from fridge (never entered).  
Afternoon: you cook from memory / Instagram / a paper card, not from the app’s Recipe.  
Evening: farmers-market tomatoes and bulk bin rice (no barcode, receipt is a handwritten total or none).  
Weekend: you open a second jar of pasta sauce because the first was “almost empty” but the app still shows 1.0.  
Guest brings wine and cheese. Garden herbs. Spouse uses the last of the butter while you’re offline and never opens the app.

After two weeks the app still thinks you have what the last scanned receipt and two cooked recipes imply. You open it in the store for chicken parm parmesan — it’s wrong. You stop opening it.

**Recount is not a product solution; it is a confession UI.** Users who would diligently recount already succeed with a notes app. Users who need automation will not open “recount flour” weekly. The editable cook preview reduces recipe-path drift but does nothing for non-recipe consumption (the majority of calories in many households).

**What would meaningfully reduce failure (not marketing):**  
1. **Redefine the promise.** “Know what you bought and what you planned to cook” is survivable. “Live accurate inventory of everything” is not, with this input set.  
2. **Bias to high-signal items:** track only “care about” ingredients (expensive, spoilable, recipe-critical). Staples (salt, oil, rice bulk) as binary in/low/out, not gram precision. Precision inventory for 40 items beats false precision for 400.  
3. **Passive / low-friction outs:** home-screen widgets, share-sheet “used some,” Siri/Assistant shortcuts, NFC tags on bins, barcode scan *when putting away* (not only shopping), spouse SMS/link “we’re out of milk.”  
4. **Household social loop:** every unlogged consumption is a multiplayer problem; if only one adult uses the app, drift is guaranteed. Onboarding must require two members or explicitly set single-user mode expectations.  
5. **Trust UI:** show confidence per item (“last verified 3 days ago · 2 unverified cooks · receipt match medium”). Never display false precision (“1137 g flour”) when the chain is weak — show “about 1 bag” or “unverified.”  
6. **Scheduled soft recount:** weekly 60-second “tap what’s wrong” over LOW items only, not full pantry.  
7. **Accept negative / clamped zero with audit**, and prompt “still have some?” when cook would go negative — that recovers reality better than silent negative stock.

**Cost now vs later:** Now: product scope and UX honesty before M1 UI shell. Later: building M2–M4 on a core loop users abandon; monetization cannot fix a dead habit.

---

### C4. Three-dimension unit model cannot represent real ingredients; silent corruption is inevitable at the edges the UI “asks once”

**What breaks:** Mass / volume / count + density + gramsPerCount is necessary but not sufficient. Many recipe and package units are **form- and package-dependent opaque counts**, not convertible dimensions. The fail-loud result type only helps when conversion is attempted; the product still has to store *something* for “3 cloves,” “1 can,” “1 bunch,” “2 slices.”

**Concrete failure scenarios:**  
| Input | Why 3D breaks |  
|---|---|  
| Recipe: “3 cloves garlic”; pantry: jar of minced garlic (volume) or garlic powder | Different *forms* of the same canonical ingredient; density/clove weight does not map jar↔cloves↔powder safely. |  
| “1 bunch cilantro” | Bunch mass varies 2–4× by store/season. One user answer cached forever is systematically wrong next month. |  
| “1 can diced tomatoes” (recipe) vs purchase “14.5 oz can” vs drained weight in cooking | Can is a package count; recipe may mean drained solids. Drained weight ≠ label weight. |  
| “A pinch of salt” / “to taste” | No stable quantity; deducting a fixed epsilon still drifts salt (staple) over months. |  
| “2 slices bacon” | Slice thickness varies; package is mass. |  
| Whole chicken vs boneless skinless breast | Same “chicken” name, edible yield differs ~30%+. |  
| Flour cup by scoop vs sift | Published density tables disagree by 20%+; one `densityGPerMl` per ingredient is a fiction that corrupts every baker. |

Is a 4th dimension needed? **Not a fourth physical dimension — a first-class *form / preparation / package basis* on quantities.** e.g. `IngredientVariant` or quantity basis: `{ ingredientId, form: 'clove'|'minced'|'powder', package?: 'can_14_5oz' }`. Conversion is only defined along explicit edges in a graph, not via a global density scalar.

**Recommended fix:**  
- Seed graph of **allowed conversions** (clove→g, can_diced_tomato→g drained, bunch→g with wide uncertainty).  
- Store uncertainty or refuse cross-form auto-deduct without cook-preview confirmation.  
- Separate **stocking unit** (what you buy) from **recipe unit** (what you use).  
- For staples and “to taste,” support **non-quantified** pantry state: `present | low | out` without gram theater.

**Cost now vs later:** Now: core unit model redesign before seed of 300 ingredients. Later: every density row is tech debt; migration of `qtyBase` meanings is hell.

---

### C5. Projection maintenance and rebuild are unspecified — 50k txns + multi-device will diverge

**What breaks:** Spec says `PantryItem.qtyBase` is a materialized projection but never says **who** updates it, **when**, or what happens if projection ≠ `sum(deltas)`. At 50k transactions, full re-fold on every sync is painful on a mid-range phone; pure incremental apply without versioning is wrong under concurrent absolute events (C1).

**Concrete failure scenario:** Device A applies txns 1…N incrementally. Sync pull inserts an older `occurredAt` txn that was offline (or a recount). Incremental code does `qty += delta` in arrival order → wrong projection. UI shows 2 kg flour; rebuild-from-log would show 0.4 kg. Low-stock and grocery list both wrong. No invariant test in the verification section requires “projection always equals fold(log)” *after sync merge*, only after local random apply.

**Recommended fix:**  
- Projection always derived by **deterministic fold** of household log ordered by `(occurredAt, deviceId, clientTxnId)` with documented absolute/relative rules.  
- Incremental maintain as cache only; **re-fold ingredient** (or full pantry) whenever merge inserts a txn not strictly after local watermark.  
- Persist `projectionEpoch` / `lastFoldedTxnCursor`.  
- Server holds authoritative projection optional; clients may recompute.  
- Index: `(householdId, ingredientId, occurredAt)`, unique `(householdId, clientTxnId)`.

**Cost now vs later:** Now: pure functions in `core/pantry` + sync contract. Later: irreproducible “ghost stock” bugs only in multi-device production.

---

## Major — will cause significant rework if not addressed

### M1. Receipt pipeline worst cases will make the “wow feature” feel like data entry hell

**What breaks:** Spec lists some edge cases but underestimates Costco-class receipts and confirmation fatigue. Free tier is 15 scans/month — a bad scan that burns the quota and still needs 20 taps is a churn event.

**Concrete failure scenarios:**  
1. **Costco:** many lines are item codes / house brands with minimal English; 40+ lines; membership/tax/coupons mixed. Vision model returns garbage names → cascade falls to “ask user” × 40. User abandons review screen.  
2. **Same item three times** (three yogurt multipacks on separate lines): if auto-accepted as three full matches without aggregating, quantity triples; if one line is medium confidence and two high, partial mess.  
3. **Faded thermal:** OCR/vision fails; user already used a scan quota; no “type total / skip” recovery path specified.  
4. **Non-grocery (Home Depot, pharmacy):** after parse, most lines filtered; user wasted a scan and wait time. No pre-classify “is this a grocery receipt?” gate.  
5. **Price-per-lb:** handled in prose for bananas; not specified for catch-weight meat with store PLU codes only.  
6. **Loyalty negative lines / multipack discounts:** can zero out or flip signs if not paired to parent SKU.  
7. **Non-English receipts:** not mentioned; matcher and seed aliases are English-centric.  
8. **Worst-case taps:** 40-line receipt × (match confirm + size disambiguation + reject non-food) ≈ **80–120 taps**. That is not a wow; that is QuickBooks.

**Recommended fix:**  
- Pre-parse grocery likelihood; multi-photo stitching with progress.  
- **Bulk actions** on review: accept all high-confidence, “these 12 are produce — apply defaults,” skip all non-food one tap.  
- Costco/warehouse: integrate **barcode on pack at put-away** as primary path; receipt as secondary.  
- Cache store-specific SKU→ingredient maps per user and promote carefully.  
- Don’t charge quota until user commits ≥1 line (or charge half for abandoned parse).  
- Language: pass receipt locale to model; don’t run English alias table first on DE/ES receipts.

**Cost now vs later:** M2 design pass vs rebuilding review UX after App Store reviews say “scan is unusable.”

---

### M2. Ingredient matching will silently corrupt inventory on lookalike dairy/cream strings

**What breaks:** Cascade step 4 (fuzzy) without a hard negative list or hierarchical ingredient taxonomy will map “cream” ↔ “sour cream” ↔ “heavy cream” ↔ “cream cheese” and “stock” ↔ “stock cube” ↔ “broth.” Spec’s only guard is confidence floor (undefined) and “ask user” at the bottom. Auto-accept on high confidence (receipt path) is the corruption gun.

**Concrete failure scenario:** Receipt line `HVY CRM 16OZ` fuzzy-matches “cream” (half-and-half) above floor because trigram overlap with “heavy cream” is high and global alias table has a bad promotion from another user who confirmed wrong. Purchase +200 ml lands on half-and-half. Cook of soup deducts heavy cream from empty canonical row. Two ingredients wrong; user can’t see why.

**Global alias poisoning:** “aliases confirmed by many users get promoted into the global table” — no quorum, no expert review, no canary, no per-store namespace. Ten users in a coordinated sense (or one confused power user with many devices) can poison `PARM` → wrong SKU for everyone.

**Recommended fix:**  
- Taxonomy with **sibling exclusion**: fuzzy candidates that are co-hyponyms under Dairy/Cream require exact or LLM disambiguation — never auto-accept.  
- Promotion: N independent households, disagreement rate below threshold, plus manual or model audit; global aliases are **server-curated**, not automatic majority.  
- User-learned aliases never auto-promote; only anonymized suggestions enter a review queue.  
- Fixture suite must include adversarial near-miss pairs; track false-positive rate as a release gate (spec mentions fixtures but not near-miss negatives).  
- Receipt auto-accept only on exact/learned/global exact — fuzzy always medium bucket (one tap).

**Cost now vs later:** Matching policy now vs poisoned global table and irrevocable inventory merges later.

---

### M3. Par-level learning produces alert fatigue and absurd thresholds

**What breaks:** Seed from typical package, then median of 3+ purchases. No seasonality, no multi-modal package mix, no notification policy.

**Concrete failure scenarios:**  
1. **Cold start (0–2 purchases):** par = one 5 lb flour bag. User keeps 10 lb at home; at 2 lb remaining app is calm (above 25% of 5 lb… wait, 2/5=40%, still not LOW; at 1 lb = LOW). Meanwhile milk par from “typical package” = 1 gallon; household of 5 buys 2 gallons every 3 days — constant LOW noise or never LOW depending on seed.  
2. **Seasonal turkey:** three Thanksgiving purchases over three years → par ≈ whole turkey weight; “LOW” on turkey in March.  
3. **Bulk buyer:** median purchase = 25 lb rice; 25% threshold = alert only below ~6 lb — too late for “I should get rice.”  
4. **Two sizes:** alternating 12 oz and 32 oz coffee → median oscillates; alerts feel random.  
5. **25% of par for staples with higher threshold:** still no **rate** limit on notifications. Ten items go LOW after one cook → notification storm → user disables all notifications → par system becomes dead UI badges.

**Recommended fix:**  
- Par = f(median purchase, time-between-purchase, seasonal category, user override).  
- Alerts: batch daily “shopping brief,” not per-item push; user-configurable quiet hours; max N pushes/week.  
- Separate **reorder cadence** suggestions (already in grocery list) from **urgent out** (epsilon).  
- Don’t learn par from purchases more than X months apart without seasonal tag.

---

### M4. Universal Expo bet: web SQLite is alpha; COOP/COEP has product fallout

**What breaks:** Spec correctly flags expo-sqlite web as highest technical risk but understates severity: official docs (SDK 57) mark **web support as alpha / may be unstable**, requiring Metro wasm config **and** `Cross-Origin-Embedder-Policy` + `Cross-Origin-Opener-Policy` for SharedArrayBuffer. That is not a “swap the repository” footnote — COOP/COEP changes how the **entire origin** loads cross-origin resources (OAuth popups, analytics, AdSense, Stripe.js, embedded content).

**Concrete failure scenario:** M0 “prove SQLite on web” passes on localhost with headers set. Production web hosting misconfigures headers → silent SQLite failure or fallback. Or headers work but Google sign-in popup / RevenueCat web / AdSense breaks isolation. Team spends a milestone on web storage anyway, then ships a second IndexedDB implementation — the “interface saves us” claim becomes two full drivers plus sync testing matrix ×3.

**Dependencies with weak or no web story:**  
| Piece | Web reality | Fallback cost |  
|---|---|---|  
| `expo-sqlite` | Alpha; wasm + COOP/COEP | Second storage backend; dual-path bugs |  
| `react-native-google-mobile-ads` | Native only | AdSense rewrite; different policy/UX |  
| RevenueCat native IAP | Store only | Web Billing / Stripe (now better; see facts) |  
| `expo-camera` | `<input capture>` | Acceptable but different UX/quality |  
| Push notifications | Web push separate | Extra path for low-stock alerts |  

**Recommended fix:** Decide in M0 whether web is **peer product** or **companion** (view-only grocery list). If peer: budget real multi-backend storage, don’t call it a thin interface. If companion: drop offline SQLite on web; use Supabase direct + service worker cache. Do not let alpha sqlite-wasm gate the mobile product.

---

### M5. Scale: missing indexes, unscoped community queries, old Android pain

**What breaks:** Spec never specifies indexes, pagination, or list virtualization. “500 pantry items, 2000 community recipes, 50k txns” is enough to jank a 4-year-old Android if naive.

**Concrete failure scenarios:**  
- Opening pantry runs `SELECT * FROM pantry_txn` to re-fold or to show history → multi-second main-thread hitch.  
- Community “recipes with chicken and rice” as client-side filter of 2000 rows downloaded entirely.  
- Matching fuzzy against full alias table on every receipt line on-device.  
- No FTS on recipe title/ingredients locally; no `ingredient_id` covering index on txns.

**Recommended fix (minimum):**  
- Indexes: `pantry_txn(household_id, client_txn_id UNIQUE)`, `(household_id, ingredient_id, occurred_at)`, `(household_id, synced_at)` for pull cursor; `recipe` FTS or server search only.  
- Never load full txn history into UI; page it.  
- Projection table is the hot path; history is cold.  
- FlashList / virtualization for pantry and community.  
- Matching: in-memory trie for exact; fuzzy only over short candidate lists from blocking keys (normalized first token).

---

### M6. Freemium + unit economics rest on an unvalidated ~$0.002/receipt and ignore support cost of bad scans

**What breaks:** Free user “~$0.03/mo inference vs $0.10–0.50 banner” assumes cheap vision and that users who hit 15 scans are happy. Bad scans still cost inference **before** commit if quota is checked only pre-call but abandoned reviews already spent money. AdMob eCPM for a niche pantry app is often at the low end; family shared devices suppress personalized ads after ATT.

**Concrete failure scenario:** Power free user: 15 scans × retries × multi-photo long receipts × Gemini tokens for 40-line JSON → several cents to tens of cents in a bad month; banner RPM on iOS with ATT deny is poor; net negative cohort. Spec has no circuit breaker by $ cost, only by scan count.

**Recommended fix:** Cap by **$ or token budget** server-side, not only scan count; cheaper model first with escalate; don’t re-charge full parse on “add second photo.”

---

### M7. Allergen / dietary safety is unmodeled while AI chef is paid

**What breaks:** Spec defers dietary profiles to a field, then sells AI chef “what can I make tonight” with pantry context. A wrong ingredient match (cream cheese vs cream) or a community recipe with free-text “nut topping” unmatched to almond can kill someone. This is not polish; it is product liability.

**Concrete failure scenario:** User marks peanut allergy. Community recipe imports “natural PB cups” matched to “chocolate candy.” AI chef recommends it because pantry has “chocolate.”  

**Recommended fix:** Allergen graph on canonical ingredients; refuse auto-match when allergen tags disagree; AI chef must treat free-text unmatched lines as **unknown allergens**, not safe. Do this before M3, seed in M1 ingredient model.

---

### M8. Open Food Facts is not “free, no API key, commercial OK” without compliance work

**What breaks:** Spec: “Open Food Facts is free, no API key, returns exact product + package size.” Reality: ODbL **share-alike** and attribution; rate limits 15 product reads/min/IP; custom User-Agent required; commercial use allowed **under licence conditions**; combining OFF data into a closed proprietary database can trigger share-alike obligations on the **derived database**. No SLA. Bulk use should be dumps, not API scrape.

**Concrete failure scenario:** Larder builds proprietary global SKU→ingredient map partly from OFF product quantities and ships a paid app. A compliance demand or community complaint forces opening the combined DB or stripping OFF-derived rows — matching quality collapses.

**Recommended fix:** Legal review of ODbL interaction with your seed DB; attribution in app; prefer local dump + delta for barcodes; treat API as online enhance with rate-limit budget; document what is derived vs original.

---

## Minor / polish

- Spec internal inconsistency: ledger `reason: 'recount'` vs gaps text “recount flow that snaps… with an `adjust` txn.” Pick one and define semantics (see C1).  
- Negative inventory policy undefined (clamp vs allow vs block cook).  
- Device clock skew: `occurredAt` from client is not trustworthy for LWW; need server `acceptedAt` + client time.  
- No soft-delete / tombstone story for ingredients or recipes with historical txns.  
- No multi-location beyond pantry|fridge|freezer (cabin, office fridge).  
- Garden produce, gifts, meal kits, restaurant leftovers: zero intake path.  
- Returns/refunds at store: no reverse purchase.  
- Currency and unit preference (US vs metric display) underspecified for international receipts.  
- Household: who can recount? admin roles? kid accounts?  
- Recipe “2.5 eggs” after scale-down: fractional count UX.  
- Cook preview substitutions: does substitute deduct the substitute ingredient? Unspecified.  
- Seed data versioning / migration when densities improve.  
- Offline queue for receipt images when scan quota exhausted.  
- Accessibility, dynamic type in cooking mode, TalkBack/VoiceOver for review screen.  
- App Store privacy nutrition labels for receipt images (even if discarded — processing still disclosed).  
- “15 receipt scans” abuse via multiple free accounts / household.  
- Adjacency of banner to bottom tabs = accidental click policy risk if nav is bottom (common RN pattern).  
- No conflict strategy for last-write-wins recipe edits while someone is mid-cook.  
- Cost-per-meal with incomplete prices will show false confidence.  
- Web and native feature parity matrix missing (will cause “works on my phone” support hell).

---

## Factual corrections to the spec

### Expo / React Native versions
- **Current latest stable Expo SDK (as of 2026-07-25):** **SDK 57** (`expo@^57`, npm latest observed 57.0.8).  
- **React Native for SDK 57:** **0.86**; React **19.2.3**.  
- Spec’s “pin at init, don’t assume a number” is fine as process; do **not** assume SDK 52-era docs.  
  Sources: [Expo SDK reference](https://docs.expo.dev/versions/latest/), [npm expo](https://www.npmjs.com/package/expo), [Upgrade walkthrough](https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/).

### `expo-sqlite` on web (highest-risk item — real answer)
- Web is a **documented target** but officially **alpha and may be unstable**.  
- Requires: Metro config for **wasm**; HTTP headers **`Cross-Origin-Embedder-Policy`** and **`Cross-Origin-Opener-Policy`** so **`SharedArrayBuffer`** works; EAS Hosting example uses `COEP: credentialless` + `COOP: same-origin`.  
- Spec’s OPFS mention is directionally right for wasm SQLite ecosystems; Expo’s own docs emphasize **wasm + COOP/COEP / SharedArrayBuffer**, not a casual “it just works.”  
- **M0 must treat failure as likely**, not merely “possible.” Repository interface is necessary but not sufficient.  
  Source: [Expo SQLite docs — Web setup](https://docs.expo.dev/versions/latest/sdk/sqlite/).

### Vision OCR cost vs ~$0.002/receipt
- Cheap capable vision routes exist (Gemini Flash / Flash-Lite class on OpenRouter; e.g. Gemini 2.5 Flash listed around **$0.30 / $2.50 per 1M** input/output tokens).  
- Image token accounting (Gemini): small images ~258 tokens; larger images tiled (e.g. 768×768 tiles × 258). A downscaled receipt might be ~1–3k image tokens + prompt + long JSON out for 40 lines.  
- **Ballpark good case:** well under a cent (order of **$0.0005–$0.003**) for a short receipt on Flash-class models — so **~$0.002 can hold for simple receipts**.  
- **Does not hold** for: multi-page Costco, high-res without downscale, expensive models, retries, or verbose chain-of-thought models. Unit economics should use **p95 cost**, not best case.  
- OpenRouter also has platform credit fees in some analyses (~5%+); budget overhead.  
  Sources: [OpenRouter Gemini 2.5 Flash](https://openrouter.ai/google/gemini-2.5-flash), [Gemini tokens / images](https://ai.google.dev/gemini-api/docs/tokens), [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing), [OpenRouter pricing](https://openrouter.ai/pricing).

### Open Food Facts
- **Commercial use:** permitted under free licences **with conditions** (attribution + **share-alike** for ODbL database). Not “no strings.”  
- **Rate limits:** **15 req/min/IP** for product reads; **10 req/min/IP** for search; custom **User-Agent** required; fill API usage form; bulk via **daily dump**, not scrape.  
- Spec overstates simplicity for a monetized app.  
  Sources: [OFF Terms](https://world.openfoodfacts.org/terms-of-use), [OFF API docs](https://openfoodfacts.github.io/openfoodfacts-server/api/), [OFF data page](https://world.openfoodfacts.org/data).

### RevenueCat web vs Stripe direct
- RevenueCat Web is real and mature enough: **RevenueCat Billing**, **Stripe Billing**, **Paddle Billing**; Web SDK, purchase links, paywalls, funnels; entitlements unify with mobile.  
- Spec’s “RevenueCat (native) / Stripe (web)” is outdated as a forced split — you *can* unify entitlements via RC Web + Stripe engine.  
- Stripe direct still valid if you want full control; RC is worth it if you want one entitlement plane and less webhook glue. Not free of Stripe fees either way.  
  Source: [RevenueCat Web overview](https://www.revenuecat.com/docs/web/overview).

### NativeWind v4 vs current Expo
- Spec pins **NativeWind v4**. Ecosystem has been rocky across SDK 53–54 (Reanimated 3 vs 4 peer dependency breaks); **v4.2.0+** needed for newer Reanimated; NativeWind **v5** docs exist for current Expo install paths.  
- Expect **pin-and-verify** in M0, not “closest to CSS, just works.” Cache resets and Metro config remain footguns.  
  Sources: [NativeWind installation](https://www.nativewind.dev/v5/getting-started/installation), [NativeWind #1574](https://github.com/nativewind/nativewind/issues/1574), community SDK 54 reports.

### AdMob / cooking mode
- Spec correctly avoids ads on cooking mode.  
- Policy detail: banners must **not** sit next to interactive controls (next buttons, nav bars, high-interaction screens) — accidental clicks are a disable-ads offense. Bottom tab bar + sticky banner is a classic violation pattern.  
- Interstitials must not appear during focused tasks (cooking would be disallowed).  
  Sources: [Banner ad guidance](https://support.google.com/admob/answer/6128877?hl=en), [Discouraged banners](https://support.google.com/admob/answer/6275345?hl=en), [Disallowed interstitials](https://support.google.com/admob/answer/6201362?hl=en).

### Stale or soft-wrong wording in SPEC
| Spec claim | Correction |  
|---|---|  
| “Sync is nearly free… union… cannot corrupt each other” | False for recount/absolute and double-entry of same physical event (C1, C2). |  
| “Open Food Facts is free, no API key” | True-ish for read, but licence + rate limits + User-Agent + share-alike. |  
| NativeWind v4 as default without version risk | Version coupling to Expo/Reanimated is a real M0 risk. |  
| expo-sqlite web as mitigable interface swap | Alpha + COOP/COEP is origin-wide, not a driver detail. |  
| ~$0.002/receipt unit economics | Plausible for best case Flash; use p95. |  
| “Gaps and oversights” as completeness claim | Incomplete (see below + C3). |  

---

## Questions only the product owner can answer

1. **What does “accurate pantry” mean in the store listing?** Live gram-level inventory, or “bought + planned cooks + rough stock”? This single sentence decides whether C3 is a redesign or a copy change.  
2. **Is web a peer offline client or a secondary surface?** If secondary, cut sqlite-wasm from the critical path.  
3. **Household: required for v1 or truly M3?** Double-entry bugs (C2) appear the day a couple both installs — if marketing shows two phones, C2 is M1.  
4. **Who wins a recount conflict — last timestamp, designated admin, or manual merge?**  
5. **Precision scope:** track 40 “care” items deeply vs 400 items shallowly?  
6. **Allergen liability appetite:** ship AI chef only with hard allergen graph, or accept “best effort” legal posture?  
7. **OFF-derived data:** willing to open-share derivative DB under ODbL, or keep matching data fully original / licensed elsewhere?  
8. **Receipt quota philosophy:** charge on parse start, on commit, or on successful lines? Refunds for failed OCR?  
9. **Default measurement culture:** US retail packages + cups, or metric-first? Affects seed and OCR prompts.  
10. **Single-user mode honesty:** will you block or warn when a second household member never logs in (predictable drift)?  
11. **Negative stock:** allow (signal drift) or hard-block cook?  
12. **Paid tier priority:** AI chef vs unlimited scans vs household — which actually drives conversion if free core must remain “genuinely good”?

---

## Attack surface coverage checklist

| # | Surface | Covered in |  
|---|---|---|  
| 1 | Unit model | C4, Minor |  
| 2 | Ledger + projection | C1, C5 |  
| 3 | Sync / multi-device | C1, C2 |  
| 4 | Receipt pipeline | M1 |  
| 5 | Par / low-stock | M3 |  
| 6 | Ingredient matching | M2, M7 |  
| 7 | Universal platform | M4, facts |  
| 8 | Scale / performance | M5 |  
| 9 | Retention / graveyard | **C3** (primary) |  
| 10 | Unmentioned gaps | C3, M7, M8, Minor list; falsifies “gaps” completeness |  
| — | External fact checks | Factual corrections section |

---

*End of red-team. No application code was written or modified; only this report file was created.*

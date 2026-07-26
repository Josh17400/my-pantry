# M2 Track A — receipt parsing Edge Function

**Date:** 2026-07-26  
**Scope:** `supabase/functions/parse-receipt/**` only  
**Not touched:** `apps/web/**`, `packages/core/**`, `supabase/migrations/**`  
**Commits:** none (per brief)  
**Deployed:** **no** — owner must link the project and deploy

---

## Deliverables

| Path | Purpose |
|---|---|
| `supabase/functions/parse-receipt/index.ts` | HTTP entry (auth, secrets, actions) |
| `lib/pipeline.ts` | Orchestration with injected vision + usage store |
| `lib/normalize.ts` | Weighed / multi-buy / discount parent pairing |
| `lib/grocery_gate.ts` | Grocery-likelihood accept/reject |
| `lib/schema.ts` | Strict JSON schema + runtime validators |
| `lib/cost.ts` | Token→USD estimate + budget circuit breaker |
| `lib/quota.ts` | Commit-time scan counter |
| `lib/vision.ts` | OpenRouter client + fixture client |
| `lib/usage_store.ts` | In-memory (tests) + Supabase adapter |
| `lib/privacy.ts` | Safe logs (no image bytes / raw receipt text) |
| `fixtures/*.json` | Model response fixtures |
| `tests/*_test.ts` | Deno unit tests (39) |
| `README.md` | Local test + deploy notes |

---

## Pipeline

```
POST /functions/v1/parse-receipt
  Authorization: Bearer <supabase_jwt>
```

### `action: "parse"` (default)

1. **Authenticate** via `supabase.auth.getUser()` with the caller JWT. Anonymous / missing / invalid JWT → `401 unauthorized`.
2. **Scan quota check** (before any paid call) — free tier **15 committed scans/month**. Parsed-but-not-committed attempts do **not** count.
3. **Dollar budget check** — projected gate+parse cost vs monthly USD ceiling (default **$0.50** free / **$5.00** paid). Rejects with `budget_exceeded` before OpenRouter when current or projected spend would exceed.
4. **Record attempt** (`status: attempted`, cost 0).
5. **Grocery gate** — cheap structured vision call. Home Depot / hardware / non-receipt → `not_grocery`, scan **not** charged; gate token cost still recorded for budget.
6. **Full vision parse** — Flash-class model + strict `json_schema`. Schema violation → **retry once**, then `schema_violation` (scan not charged).
7. **Normalize** lines (mass, multi-buy, discounts, allergens).
8. **Return** items + summary; `quotaCharged: false`, `status: "parsed"`.

### `action: "commit"`

Client calls after the user accepts ≥1 line into the pantry.

- Flips attempt `parsed` → `committed`.
- **This is when the free-tier scan counter increments.**
- Idempotent if already committed.

### `action: "abandon"`

User leaves review without committing.

- Flips to `abandoned`.
- **Scan not charged.** Dollar cost of the parse remains in the monthly budget sum (we already paid OpenRouter).

---

## Quota and budget accounting (explicit)

| Event | Counts as scan (free 15/mo)? | Counts toward $ budget? |
|---|---|---|
| Gate rejects non-grocery | No | Yes (gate tokens only) |
| OCR / schema failure | No | Yes |
| Parse success, user abandons review | No | Yes |
| Parse success, user commits | **Yes (1)** | Yes |
| Unreadable image | No | Yes |

**Design principle (SPEC + red-team M1/M6):**

- **Charge on COMMIT, not on parse** — failed OCR and abandoned reviews never burn a free scan.
- **Dollar circuit breaker is separate** — a 40-line multi-photo warehouse receipt can cost many× a corner store slip; a scan counter alone does not bound spend.

### Config (env / secrets)

| Variable | Default | Meaning |
|---|---|---|
| `OPENROUTER_API_KEY` | *(required)* | Vision API key — function secret only |
| `RECEIPT_VISION_MODEL` | `google/gemini-2.5-flash` | Full parse model |
| `RECEIPT_GATE_MODEL` | `google/gemini-2.5-flash` | Pre-check model |
| `RECEIPT_FREE_SCAN_LIMIT` | `15` | Committed scans / month |
| `RECEIPT_MONTHLY_BUDGET_USD` | `0.5` | Free $ ceiling |
| `RECEIPT_PAID_MONTHLY_BUDGET_USD` | `5` | Paid $ ceiling |
| `RECEIPT_PROMPT_USD_PER_M` | `0.3` | Cost model input |
| `RECEIPT_COMPLETION_USD_PER_M` | `2.5` | Cost model output |
| `RECEIPT_USAGE_BACKEND` | supabase (if service role) | `memory` for local smoke only |

Paid detection: `user.app_metadata.plan` or `user_metadata.plan` ∈ `{ paid, pro, unlimited }`.

### Schema dependency (migrations track)

This track **did not** add migrations. Production usage needs:

```sql
-- Conceptual DDL for schema track (not applied here)
create table public.receipt_parse_attempts (
  id text primary key,
  user_id uuid not null references auth.users(id),
  household_id text,
  status text not null, -- attempted|parsed|failed|not_grocery|committed|abandoned
  estimated_cost_usd numeric not null default 0,
  prompt_tokens int not null default 0,
  completion_tokens int not null default 0,
  model text,
  image_count int not null default 0,
  locale text not null default 'en-US',
  month_key text not null, -- YYYY-MM UTC
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  committed_line_count int
);
-- indexes: (user_id, month_key), RLS owner-only + service role writes
-- optional RPC: receipt_usage_snapshot(p_user_id, p_month_key)
--   → { committed_scans, spent_usd }
```

Until that lands, the function falls back to `InMemoryUsageStore` when `RECEIPT_USAGE_BACKEND=memory` or service role is missing — **not multi-instance safe**.

---

## Model and estimated cost

| | Value |
|---|---|
| Model | `google/gemini-2.5-flash` (OpenRouter) |
| Pricing used for breaker | ~$0.30 / M input, $2.50 / M output |
| Good-case short receipt (gate + parse) | ~**$0.001–0.004** (order of red-team best case) |
| Fixture pipeline cost (1 image) | **~$0.00285** estimated |
| p95 multi-photo warehouse (4–6 images, long JSON, possible retry) | **~$0.01–0.05+** — breaker is what bounds free-tier spend |
| Free monthly $ ceiling | **$0.50** ≈ many short receipts or a handful of warehouse+retry tails |

Economics intentionally use **p95-aware budget**, not the ~$0.002 marketing number alone (red-team M6).

---

## Privacy

- **Parse and discard by default.** Function never writes image bytes to storage or DB.
- `retainImage: true` is an opt-in flag only; retention path is private bucket + owner RLS + 30-day purge (storage/migrations track). This function still never logs bytes.
- `safeLog()` strips keys matching image/base64/rawText/storeAddress/etc.
- Info logs: `attemptId`, `userId`, token counts, cost, model, line **count**, locale — never receipt text or card last-4.

---

## Allergen propagation

Track D matcher allergen veto is inert when the query has no tags (raw OCR case).

| Situation | Line fields |
|---|---|
| No UPC / no prior map | `allergens: []`, **`allergensUnknown: true`** |
| UPC present + `knownAllergensByUpc` from client | `allergens: [...]`, `allergensUnknown: false` |
| UPC present, no map | still **`allergensUnknown: true`** |

**Unknown is unsafe, never clear.** Client matcher should treat `allergensUnknown` like recipe free-text unknowns.

---

## Response line shape

Per line (normalized):

`rawText`, `guessedName`, `quantity`, `unit`, `massG`, `volumeMl`, `packageSize`, `unitPrice`, `totalPrice`, `confidence`, `lineType` (`food` \| `non-food` \| `tax` \| `discount` \| `total` \| `unknown`), `upc`, `parentLineId`, `multiBuy`, `weighed`, `allergens`, `allergensUnknown`.

Plus parse `summary`: model, gate model, tokens, `estimatedCostUsd`, confidence buckets, locale, image count, `schemaRetryUsed`.

---

## Verification

```text
cd supabase/functions/parse-receipt
npx deno test --allow-read --allow-env tests/
# → ok | 39 passed | 0 failed

npx deno check index.ts
# → Check index.ts (clean)
```

### Fixture coverage

| Fixture | Asserts |
|---|---|
| `normal-receipt.json` | Food lines, allergensUnknown default, no scan charge until commit |
| `warehouse-receipt.json` | Item codes, UPC extract, non-food lines |
| `weighed-items.json` | `BANANAS 2.14 LB @ 0.59` → massG; multi-buy `2 @ 3.49` |
| `discount-lines.json` | Negative discounts paired to parent |
| `non-grocery.json` / gate-no | Home Depot rejected; full parse not invoked |
| `malformed-response.json` | Schema fail → retry → clean `schema_violation` |
| cost_budget_test | Breaker trips at ceiling / would_exceed |

---

## Deploy commands (owner)

```bash
cd C:\Users\joshu\Documents\Larder
npx supabase login
npx supabase link --project-ref <YOUR_PROJECT_REF>

npx supabase secrets set OPENROUTER_API_KEY=sk-or-v1-...
# optional:
# npx supabase secrets set RECEIPT_VISION_MODEL=google/gemini-2.5-flash
# npx supabase secrets set RECEIPT_MONTHLY_BUDGET_USD=0.5
# npx supabase secrets set RECEIPT_FREE_SCAN_LIMIT=15

npx supabase functions deploy parse-receipt
```

Keep JWT verification **enabled**. Do not put the OpenRouter key in any `VITE_*` client env.

**This track did not deploy.** Do not treat the function as live until the owner runs the commands above and the usage table (or RPC) exists.

---

## What could not be verified without deployment

| Check | Status |
|---|---|
| Live OpenRouter call with real receipt photos | Not run (no API key in agent env; fixtures only) |
| JWT auth against hosted Supabase | Not run |
| `receipt_parse_attempts` insert/RLS | Table not in migrations yet |
| Multi-instance quota race under commit | Needs DB unique constraints / RPC |
| Image retention bucket + 30-day purge | Out of scope (storage track) |
| End-to-end client review → commit | Client is a separate track |

---

## Deviations / design notes

1. **Commit lives in the same function** (`action: commit|abandon`) so charge-on-commit is complete without a second edge function. Client track should call commit after pantry write.
2. **In-memory usage store** for tests and as soft fallback — production must use service-role + table/RPC from migrations track.
3. **SupabaseUsageStore.getSnapshot** prefers RPC `receipt_usage_snapshot`; table aggregate path is intentionally thin until schema lands (avoids inventing broken multi-row select helpers).
4. **Ambiguous grocery confidence** (0.35–0.55) is rejected to protect budget; product can later add “parse anyway” override.
5. **No English alias table** in this function — locale is passed to the model; matching stays on the client/core track.

---

## Open questions

1. Should abandoned reviews that still cost model $ soft-warn the user (“this used AI budget but not a scan”)?
2. Exact free monthly $ ceiling ($0.50 is a conservative guess aligned with M6; tune from production p95).
3. Household-scoped vs user-scoped scan quota (SPEC freemium is per free account; multi-account abuse remains open).
4. When migrations add `receipt_parse_attempts`, should failed gate-only attempts be sampled/analytics-only or fully retained?
5. Does paid entitlement come from RevenueCat webhook → `app_metadata.plan` (M4) or a separate `entitlements` table sooner?

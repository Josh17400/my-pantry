# parse-receipt (Supabase Edge Function)

Server half of **Receipt → pantry (M2)**. Authenticates the caller, enforces
scan-quota + dollar budget, runs a grocery-likelihood gate, then Flash-class
vision via OpenRouter with a strict JSON schema. **Never persists receipt images.**

## Actions

| `action` | Body | Charges scan? |
|---|---|---|
| `parse` (default) | `images[]`, optional `locale`, `householdId`, `retainImage`, `knownAllergensByUpc` | **No** — records attempt + $ spend only |
| `commit` | `attemptId`, `committedLineCount` | **Yes** — increments monthly committed scan count |
| `abandon` | `attemptId` | **No** |

## Local tests

```bash
cd supabase/functions/parse-receipt
deno task test
deno task check
```

## Deploy (owner)

```bash
cd C:\Users\joshu\Documents\Larder
npx supabase login
npx supabase link --project-ref <YOUR_PROJECT_REF>
npx supabase secrets set OPENROUTER_API_KEY=sk-or-...
# optional overrides:
# npx supabase secrets set RECEIPT_VISION_MODEL=google/gemini-2.5-flash
# npx supabase secrets set RECEIPT_MONTHLY_BUDGET_USD=0.5
# npx supabase secrets set RECEIPT_FREE_SCAN_LIMIT=15
npx supabase functions deploy parse-receipt --no-verify-jwt=false
```

JWT verification should stay **on** (default). The function also validates the
user via `auth.getUser()`.

## Schema dependency

Usage accounting expects `receipt_parse_attempts` (and optionally RPC
`receipt_usage_snapshot`) — owned by the migrations track. See
`lib/usage_store.ts` header and `reports/m2-a-receipt-function.md`.

Until those tables exist, set `RECEIPT_USAGE_BACKEND=memory` only for local
smoke tests (not multi-instance safe).

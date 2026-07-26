# M1 Track N — client sync layer (completes M1)

**Date:** 2026-07-26  
**Scope:** `apps/web/src/sync/**`, `apps/web/src/auth/**` (+ tests, this report)  
**Not touched:** `packages/core/**`, `apps/web/src/db/drivers/**`, `src/ui/**`, `src/features/**`, `supabase/**`  
**Commits:** none (per brief)

---

## Deliverables

| Path | Purpose |
|---|---|
| `apps/web/src/auth/**` | Email sign-in/up, session persistence, sign-out; optional overlay on offline-first |
| `apps/web/src/sync/**` | Push / pull / re-fold / metadata LWW / conflict surfacing / status / scheduler |
| `apps/web/src/auth/auth.test.ts` | 10 tests (mocked Supabase) |
| `apps/web/src/sync/sync.test.ts` | 13 tests (mocked remote + real in-memory SQLite) |
| `reports/m1-n-sync.md` | This report |

---

## Sync loop

Steady-state engine (`SyncEngine.run`), matching `supabase/SYNC.md` §8:

```
on focus / online / after_write / manual:
  1. pushOutbox()        // unacked local pantry_txns → upsert ignoreDuplicates
  2. pullAndMerge()      // accepted_at > cursor, paged; union + needsRefold/foldLedger
  3. syncMetadata()      // recipes, locations, pantry par/location LWW on updated_at
  4. persist cursor + lastSyncedAt in app_meta
```

**Household boundary map:** local app keeps writing `local-household` (existing features). Remote uses the real membership id from `my_household_ids()` / `household_members`. Push rewrites `household_id` + `user_id` (auth.uid); pull rewrites remote rows into the local household id. No feature-layer changes required for M1.

**Idempotent push:** `upsert(..., { onConflict: 'household_id,client_txn_id', ignoreDuplicates: true })`. Local `accepted_at` is set only after the request succeeds. Retry after a dropped connection is free — unique conflict is not an error.

**Pull cursor:** `app_meta.sync_pull_cursor`, initial `1970-01-01T00:00:00.000Z`. Advanced to `max(accepted_at)` per page.

**Missing schema:** PostgREST “table not in schema cache” / `42P01` maps to `SyncSchemaMissingError` with an explicit `supabase db push` message — not a mysterious empty sync.

---

## Re-fold (the multi-device bug)

Fold order is `(occurred_at, device_id, client_txn_id)` (client clock).  
Pull order is `accepted_at` (server clock). **These are different.**

After each pull page, for every affected ingredient:

1. Union remote rows into the local log (dedupe by `client_txn_id`).
2. For each incoming txn, call **`needsRefold(watermark, incoming)`** from `@larder/core`.
3. If true → **`foldLedger(fullLog)`** and write the projection.
4. If false (strictly-newer relative) → `applyIncomingTxn` incremental path is allowed.
5. Safety net: if `projectionMatchesFold` fails, force a full re-fold.

### Test (required)

`sync.test.ts` → **out-of-order re-fold**:

- Local device already has a later cook; watermark is at that cook.
- Pull delivers an earlier purchase with a *later* `accepted_at`.
- Asserts `needsRefold` is true, merge sets `refolded: true`, and projection qty equals `foldLedger(unionLog)` (800 = 1000 − 200), not a naive arrival-order mistake.
- Absolute out-of-order case also covered (recount accepted late → qty 450).

---

## Auth and offline-without-account

| Concern | Behavior |
|---|---|
| Unconfigured env | `AuthClient({ client: null })` → `signed_out`; local app unaffected |
| Sign-in / sign-up | Email + password via `@supabase/supabase-js` |
| Session | `getSession` + `onAuthStateChange`; tokens never logged (`sanitizeAuthError`) |
| Sign-out | Clears session; local pantry remains |
| Signed-out sync | `SyncEngine` skips network, status → **synced** (local-only is healthy) |
| Offline + signed-in | status → **offline**; outbox retained; next online run drains |

**There is no login wall.** Auth is optional. The grocery-store offline case is the product.

---

## Conflict surfacing

When `foldLedger` reports `conflict: true` (concurrent recounts), `ConflictSurfaces`:

- Surfaces a single notice per `(household, ingredient, form)` key
- Does not re-spam until the user dismisses
- Message tells the user the later recount (by fold order) was kept

---

## Sync UX state

`SyncStatusStore` exposes: **`synced` | `syncing` | `offline` | `error`**, plus phase, `lastSyncedAt`, `lastError`, `hasPendingLocal`, `remoteHouseholdId`.

`startSyncScheduler` listens for `visibilitychange`, `focus`, and `online` (debounced). `notifyLocalWrite(engine)` is fire-and-forget after local writes. **Nothing awaits the network on the UI path.**

`bootstrapSync(db)` wires auth + engine + scheduler when a Drizzle `AppDatabase` is available (native/node). Not auto-hooked into `main.tsx` yet — drivers do not all expose `drizzle` publicly; call sites can use `bootstrapSync` once the active repo provides the handle. Status store and engine remain importable for UI badges.

---

## Verification

```
npm run typecheck && npm run test && npm run build
```

| Suite | Result |
|---|---|
| `@larder/core` | **248** passed |
| `@larder/web` | **134** passed (111 prior + 23 new) |
| typecheck | clean |
| production build | clean |

### Tests added (minimum set from brief)

| Case | Covered |
|---|---|
| Push idempotency under retry | yes |
| Pull cursor advancement | yes |
| Out-of-order re-fold | yes (relative + absolute) |
| LWW metadata resolution | yes (pure + pantry meta preserves qty) |
| Offline queue then drain | yes |
| Signed-out local path | yes |
| Conflict once | yes |
| Schema-missing mapping | yes |

All tests use a **mocked remote** + real in-memory SQLite. **No live project required for green CI.**

---

## Live project vs mocked

| Check | Result |
|---|---|
| Env `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Present in `apps/web/.env` |
| REST `GET /rest/v1/pantry_txns` | **HTTP 404** — table not in schema cache |
| Conclusion | **Migrations have not been applied** on the live project. Auth may be reachable (Track M), but ledger/metadata tables are absent. |

The client code is written against the committed migrations. When tables are missing, the engine surfaces `SyncSchemaMissingError` / status **error** with “run `supabase db push`” — it does not silently pretend to sync.

**Owner next step:** `supabase db push` (or link + push), then a signed-in device can exercise the real loop.

---

## Deviations / notes

1. **Local ↔ remote household id mapping** at the sync boundary (local stays `local-household`) rather than rewriting all app writes after login. Correct for M1 without touching features; multi-device same-account still shares the remote household.
2. **`bootstrapSync` not wired into `main.tsx`** — would need a public `db` handle from the active repository. Engine, status store, and scheduler are ready; UI can subscribe to `getSyncStatusStore()` without a wall.
3. **Grocery list LWW** is described in SYNC.md; M1 implementation prioritizes recipes, locations, and pantry-item metadata. Grocery can follow the same LWW pattern without touching the ledger path.
4. **User aliases** same as grocery — port-ready pattern, not fully looped in engine for M1 scope focus on ledger correctness.

---

## Open questions

1. After first sign-in, should we ever migrate local `local-household` rows to the server UUID in-place (so multi-account on one device is cleaner), or keep the permanent boundary map?
2. Should conflict notices get a small UI toast in Track O / polish, or is a status-store consumer enough for M1 shell?
3. When owner applies migrations: smoke a real signup → push one txn → second device pull + re-fold — recommended end-to-end gate outside unit tests.

---

## File map

```
apps/web/src/auth/
  client.ts, types.ts, errors.ts, map-session.ts, index.ts, auth.test.ts
apps/web/src/sync/
  types.ts, errors.ts, mapping.ts, ports.ts
  local-store.ts, remote.ts
  push.ts, pull.ts, merge.ts, metadata.ts
  conflicts.ts, status.ts, device.ts
  engine.ts, scheduler.ts, bootstrap.ts
  index.ts, sync.test.ts
```

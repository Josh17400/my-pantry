# Sync contract — The Good Pantry (M1)

This document is the **client implementation contract**. The sync track implements against it.
Server schema + RLS live in `supabase/migrations/`. Credentials stay in env (`VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`) — never hard-coded.

---

## 1. Roles of the two clocks

| Field | Clock | Set by | Used for |
|---|---|---|---|
| `occurred_at` | **Client** | Device wall clock at event time | Ledger **fold total order** with `(occurred_at, device_id, client_txn_id)` |
| `accepted_at` | **Server** | Postgres `DEFAULT now()` on insert | **Pull cursor** only (`accepted_at > cursor`) |

These are **different orderings**. Client clocks skew. Pull arrival order is **not** fold order.

---

## 2. Push (local → server)

### What to push

Local `pantry_txns` rows that have not been acknowledged by the server for this household.

Suggested local flags (client-side, not in server schema):

- `accepted_at IS NULL` on the local row, **or**
- a separate `synced_at` / outbox table

### Insert shape

```sql
INSERT INTO pantry_txns (
  id, client_txn_id, household_id, ingredient_id, form_id,
  kind, delta_base, target_base, basis_cursor,
  reason, ref_id, unit_price,
  occurred_at,   -- client ISO timestamptz; do not omit
  -- accepted_at omitted → server DEFAULT now()
  device_id, user_id
) VALUES (...)
ON CONFLICT (household_id, client_txn_id) DO NOTHING;
```

### Idempotency

- Unique constraint: `UNIQUE (household_id, client_txn_id)`  
  Index name: `pantry_txn_household_client_uidx`
- Replays and double-sends are no-ops. **Do not** treat conflict as an error.
- PostgREST / supabase-js: prefer upsert with `ignoreDuplicates: true` (maps to `ON CONFLICT DO NOTHING`), or catch unique violation and ignore.

### Constraints the server enforces

- `kind IN ('relative', 'absolute')`
- relative → `delta_base IS NOT NULL`
- absolute → `target_base IS NOT NULL`
- `user_id` must equal `auth.uid()` (RLS)
- `household_id` must be a membership of the caller (RLS)
- **No UPDATE, no DELETE** on `pantry_txns` (trigger + no RLS write policies). Corrections = new compensating rows.

### Auth

Every request uses the user JWT (`anon` key + session). Service role is **not** used from the app.

---

## 3. Pull (server → local)

### Query

```sql
SELECT *
FROM pantry_txns
WHERE household_id = :household_id
  AND accepted_at > :cursor
ORDER BY accepted_at ASC
LIMIT :page_size;
```

- Initial cursor: use a sentinel **before any server time**, e.g. `1970-01-01T00:00:00Z` or `null` treated as epoch.
- Advance cursor to `max(accepted_at)` of the page (or last row’s `accepted_at`).
- Page until a short page (`length < page_size`).

### After each page (or after the full pull)

For each **ingredient_id + form_id** touched by incoming rows:

1. Union into the local log (dedupe by `client_txn_id` / primary `id`).
2. **Do not** apply qty with `qty += delta` in pull arrival order.
3. Call core:

   - If `needsRefold(localWatermark, incomingTxn)` → re-run `foldLedger` for that ingredient/form.
   - Else (strictly-newer relative only) → incremental apply is allowed by core.

4. Upsert local `pantry_items` from the fold / incremental result.

`needsRefold` already exists in `@larder/core` (`packages/core/src/pantry/projection.ts`).

---

## 4. Ordering caveat (correctness)

### Fold order (truth)

```
sort key = (occurred_at, device_id, client_txn_id)   // client clock + tie-breakers
```

Absolute events reset the accumulator; concurrent absolutes LWW by this order and may surface `conflict`.

### Pull order (transport)

```
sort key = accepted_at   // server clock
```

### What can go wrong if the client assumes “append-only arrival”

1. **Clock skew:** Device A’s `occurred_at` is earlier than B’s, but A’s row is accepted **after** B (offline then sync). Pull delivers B then A; fold order is A then B.
2. **Out-of-order pages / multi-device:** A late-accepted older txn lands at or below the local watermark → incremental delta is wrong.
3. **Absolutes:** Any absolute must re-fold regardless of arrival order.

### Client must

- Treat pull as **set union into the log**, then **project** with core.
- Use `needsRefold` (or always re-fold touched ingredients — simpler, correct, fine for M1 volumes).
- Never use `accepted_at` as the fold order.
- Preserve server-assigned `accepted_at` on local rows after pull/ack (for “already synced” and debugging).

Invariant (from SPEC): **projection == fold(log) after any merge sequence.**

---

## 5. Metadata tables — last-write-wins (not ledger union)

| Domain | Tables | Merge rule |
|---|---|---|
| Ledger | `pantry_txns` | **Union** by `client_txn_id`; fold for qty |
| Projection cache | `pantry_items` | Recompute qty from fold; **LWW on `updated_at`** for par/location/opened/expires metadata if synced |
| Recipes | `recipes`, `recipe_lines`, `recipe_steps` | **LWW on `recipes.updated_at`**; replace lines/steps for that recipe when remote wins |
| Grocery | `grocery_lists`, `grocery_list_items` | **LWW on `grocery_lists.updated_at`** (or item-level updates for `checked`) |
| Locations | `locations` | **LWW** (simple replace by `id` if remote newer — or full household snapshot) |
| Aliases | `user_aliases` | **LWW** / unique `(household_id, alias)` — last writer wins |
| Reference catalog | `ingredients`, `ingredient_forms`, `conversion_edges`, `package_specs` | **Server-owned**; client read-only; refresh from seed/version, not user merge |

### Why only the ledger needs union

Relative pantry events are **commutative deltas**; the product correctness model is “all accepted events exist in the log.” Editing or LWW-dropping a txn would invent stock. Metadata rows are **mutable documents** (recipe title, par level, checklist tick) where two writers overwrite is acceptable and simpler than CRDTs for M1.

`pantry_items.qty_base` is a **cache**, not a second source of truth. Prefer re-fold over LWW of qty. If you sync projection rows for web companions, never let a stale remote `qty_base` overwrite a fresher local fold without re-folding the log.

---

## 6. First sync (new device / fresh local DB)

1. Authenticate → JWT.
2. Resolve household: `select * from household_members` / `my_household_ids()`; if multiple, use last-active preference.
3. Pull reference catalog if local seed version lags (or always seed from `@larder/core` offline and treat server catalog as optional mirror).
4. Pull **all** household `pantry_txns` with cursor = epoch, paged.
5. Insert into local log; **full fold** per ingredient/form (or bulk `foldLedger`).
6. Pull metadata tables for the household (`locations`, `recipes`+children, `grocery_*`, `user_aliases`, optional `pantry_items` metadata columns).
7. Set local pull cursor to max `accepted_at` seen.
8. Push any local-only txns created before/during (usually none on brand-new device).

---

## 7. Full re-sync

When to full re-sync: cursor corruption, schema upgrade, “repair my pantry”, or `projection != fold` self-check failure.

1. Keep local unsynced outbox (txns with no server ack).
2. Clear or quarantine local synced txns + projection for that household (implementation choice).
3. Reset cursor to epoch; pull all txns; re-fold everything.
4. Re-push outbox with `ON CONFLICT DO NOTHING`.
5. Re-pull metadata with LWW rules.

Do **not** DELETE server `pantry_txns` (impossible under append-only).

---

## 8. Steady-state loop (suggested)

```
on app foreground / online / timer:
  pushOutbox()           // insert pending txns
  pullTxns(cursor)       // page accepted_at > cursor
  mergeAndProject()      // needsRefold / foldLedger
  pullMetadataLWW()      // recipes, par, grocery, locations
  persistCursor()
```

Realtime (optional M1+): Supabase Realtime on `pantry_txns` INSERT for the household — still merge via the same path (union + needsRefold), never trust event order as fold order.

---

## 9. Household bootstrap (auth)

| Event | Server behavior |
|---|---|
| Sign up | Trigger `handle_new_user` → `households` + `household_members` (role `owner`) + default locations |
| Create invite | RPC `create_household_invite(household_id, email?, expires?, max_uses?)` → returns row with `code` |
| Join | RPC `join_household_with_code(code)` → membership `member`; email-locked if invite.email set |
| List | RPC `my_household_ids()` or select `household_members` |

A user with **zero** memberships is a bug; the app should not special-case empty household on first login after successful signup.

---

## 10. API surface cheatsheet

| Action | Mechanism |
|---|---|
| Push txns | `from('pantry_txns').upsert(rows, { onConflict: 'household_id,client_txn_id', ignoreDuplicates: true })` |
| Pull txns | `.from('pantry_txns').select('*').eq('household_id', id).gt('accepted_at', cursor).order('accepted_at').limit(n)` |
| Invite | `.rpc('create_household_invite', { p_household_id, p_email, ... })` |
| Join | `.rpc('join_household_with_code', { p_code })` |
| My households | `.rpc('my_household_ids')` or select members |

Column names are **snake_case** on the wire (Postgres). Local Drizzle uses camelCase in TS; map at the boundary.

---

## 11. Non-goals (this contract)

- Conflict UI for recipe text edits (LWW silent is fine for M1).
- Server-side fold / projection as authority (server stores log; clients fold).
- Promoting user aliases to global catalog (SPEC: curation queue later).
- Receipt / cook de-dupe dialogs (app + core; server only stores resulting txns).

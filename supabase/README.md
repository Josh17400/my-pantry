# Supabase — The Good Pantry

Server schema, RLS, household bootstrap, and the **sync contract** for M1 multi-device.

This track owns **`supabase/**` only**. Client sync is a separate track and implements against [`SYNC.md`](./SYNC.md).

---

## Layout

```
supabase/
  config.toml                 # CLI defaults (no secrets)
  migrations/
    20260726100000_schema.sql       # tables, indexes, append-only triggers
    20260726100001_rls.sql          # RLS + membership helpers
    20260726100002_auth_household.sql  # signup → household, invites
  tests/
    rls_verification.sql      # cross-household isolation assertions
  SYNC.md                     # push/pull contract for the client track
  PARITY.md                   # local SQLite ↔ Postgres column matrix
  README.md                   # this file
```

---

## Env (owner machine)

App credentials (gitignored), e.g. `apps/web/.env`:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Never commit service role keys. Use the Dashboard or `supabase secrets` for server-side seed jobs later.

---

## Apply migrations (owner runs these)

Project was **not** linked or deployed by this track.

### Option A — Supabase CLI (recommended)

```bash
# From repo root
cd C:\Users\joshu\Documents\Larder

# One-time: login + link (project ref from Dashboard URL)
npx supabase login
npx supabase link --project-ref <YOUR_PROJECT_REF>

# Push forward-only migrations
npx supabase db push
```

### Option B — SQL editor

1. Open Supabase Dashboard → SQL Editor.
2. Run in order:
   - `migrations/20260726100000_schema.sql`
   - `migrations/20260726100001_rls.sql`
   - `migrations/20260726100002_auth_household.sql`

### Option C — Local stack

```bash
npx supabase start
npx supabase db reset    # applies all migrations cleanly
# then run RLS tests:
# psql <local-db-url> -f supabase/tests/rls_verification.sql
```

---

## After apply

1. **Auth:** email signup should already be enabled (M0). Confirm Dashboard → Authentication.
2. **Smoke signup:** create a test user → expect one row in `households`, one in `household_members` (role `owner`), default locations.
3. **Invite:** as that user, `rpc create_household_invite` → second user `rpc join_household_with_code`.
4. **RLS test:** run `tests/rls_verification.sql` (see file header). Requires ability to insert fixture `auth.users` or pre-created test users.
5. **Seed catalog (optional M1 follow-up):** load ingredients/forms/edges/packages via service role; clients may also ship seed from `@larder/core` offline.

---

## RLS model (summary)

| Table | Read | Write |
|---|---|---|
| `households` | member | owner update name; insert via definer only |
| `household_members` | member | owner update/delete; self leave; insert via invite RPC |
| `household_invites` | member | member create; owner/creator revoke |
| `locations` | member | member |
| `ingredients`, `ingredient_forms`, `conversion_edges`, `package_specs` | **public** (anon+auth) | **none** (service role seed) |
| `pantry_items` | member | member |
| `pantry_txns` | member | **INSERT only** (member + `user_id = auth.uid()`); no update/delete |
| `recipes` | public if `visibility='public'`; else author or household member | author or household member |
| `recipe_lines`, `recipe_steps` | via parent recipe read | via parent recipe write |
| `grocery_lists` | member | member |
| `grocery_list_items` | via list’s household | via list’s household |
| `user_aliases` | member | member |

Threat check: **user B must not read household A’s pantry** — see report `reports/m1-m-supabase.md` table-by-table.

---

## Sync

See **[SYNC.md](./SYNC.md)**.

- Push: insert + `ON CONFLICT (household_id, client_txn_id) DO NOTHING`
- Pull: `accepted_at > cursor` ordered by `accepted_at`
- Fold: `(occurred_at, device_id, client_txn_id)` — different clock; use `needsRefold`

---

## Parity

See **[PARITY.md](./PARITY.md)** for every local vs remote column and intentional MAP/SERVER/LOCAL deltas.

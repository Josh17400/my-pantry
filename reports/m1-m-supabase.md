# M1 Track M — Supabase schema, RLS, and sync contract

**Date:** 2026-07-26  
**Scope:** `supabase/**` only  
**Not touched:** `apps/web/**`, `packages/core/**`  
**Commits:** none (per brief)

---

## Deliverables

| Path | Purpose |
|---|---|
| `supabase/migrations/20260726100000_schema.sql` | All tables, SPEC indexes, append-only triggers |
| `supabase/migrations/20260726100001_rls.sql` | RLS on every table + helpers |
| `supabase/migrations/20260726100002_auth_household.sql` | Signup bootstrap + invite RPCs |
| `supabase/tests/rls_verification.sql` | Cross-household access assertions |
| `supabase/SYNC.md` | Client sync contract |
| `supabase/PARITY.md` | Local ↔ remote column matrix |
| `supabase/README.md` | Owner apply commands |
| `supabase/config.toml` | CLI defaults (no credentials) |

---

## Schema vs local SQLite

Mirrored from `apps/web/src/db/schema.ts` product tables:

`locations`, `ingredients`, `ingredient_forms`, `conversion_edges`, `package_specs`, `pantry_items`, `pantry_txns`, `recipes`, `recipe_lines`, `recipe_steps`, `grocery_lists`, `grocery_list_items`, `user_aliases`

### Server-only (not in local schema)

- `households`, `household_members`, `household_invites` — multi-user from M1; local still uses `local-household` until the sync/auth track wires it.

### Local-only (not on server)

- `m0_health_probe`, `app_meta` — device/shell concerns.

### Intentional type maps (see `PARITY.md`)

| Local idiom | Remote |
|---|---|
| text ISO timestamps | `timestamptz` |
| integer 0/1 booleans | `boolean` |
| text JSON blobs | `jsonb` |
| `user_id` / `author_id` text | `uuid` → `auth.users` |
| `accepted_at` nullable | `NOT NULL DEFAULT now()` |

### `pantry_txns` (SPEC-complete)

| Requirement | Implementation |
|---|---|
| relative → `delta_base` | columns + CHECK |
| absolute → `target_base`, `basis_cursor` | columns + CHECK |
| `UNIQUE (household_id, client_txn_id)` | `pantry_txn_household_client_uidx` |
| `(household_id, ingredient_id, occurred_at)` | index |
| `(household_id, accepted_at)` | index (pull cursor) |
| append-only | `BEFORE UPDATE/DELETE` triggers raise; no RLS update/delete policies |
| `accepted_at` server clock | `DEFAULT now()` |

---

## RLS model (threat: user B reads household A’s pantry)

| Table | Policy conclusion |
|---|---|
| `households` | SELECT only if member → **B cannot see A** |
| `household_members` | SELECT only if member of that household → **B cannot list A’s members** |
| `household_invites` | SELECT/mutate only if member → **B cannot read A’s codes** |
| `locations` | household membership on all ops → **denied cross** |
| `ingredients` (+ forms, edges, packages) | public SELECT; **no** client write policies → read OK, write denied |
| `pantry_items` | membership → **B cannot read A’s projection** |
| `pantry_txns` | membership SELECT; INSERT requires membership **and** `user_id = auth.uid()` → **B cannot read or inject A’s ledger** |
| `recipes` | public visibility readable by all; private requires author or household membership → **private A hidden from B**; public intentional for M3 browse |
| `recipe_lines` / `recipe_steps` | via `can_read_recipe` / `can_write_recipe` → private children **denied** |
| `grocery_lists` | membership → **denied cross** |
| `grocery_list_items` | via parent list household → **denied cross** |
| `user_aliases` | membership → **denied cross** |

**Conclusion:** Under the modeled threat, every household-scoped table denies cross-household SELECT/INSERT. Reference catalog is intentionally public-read. Public recipes are intentionally world-readable. Enforcement is RLS + (for ledger) append-only triggers; verification script attempts the same accesses.

---

## Household bootstrap

1. **Signup trigger** `on_auth_user_created` on `auth.users` → `create_household_for_user` → household + owner membership + default locations (Fridge / Pantry / Around the House + nested).
2. **Backfill** at migrate time for any existing auth users missing membership.
3. **Invite path:**
   - `create_household_invite(household_id, email?, expires?, max_uses?)` → short code
   - `join_household_with_code(code)` → member role; optional email lock
4. **Query:** `my_household_ids()`

A user with no household after successful signup should not occur; if it does, treat as ops incident (trigger failed), not an app empty-state.

---

## Commands for the owner

```bash
cd C:\Users\joshu\Documents\Larder
npx supabase login
npx supabase link --project-ref <YOUR_PROJECT_REF>
npx supabase db push
```

Then optionally:

```bash
# Local full reset + RLS script (needs Docker for supabase start)
npx supabase start
npx supabase db reset
psql <DATABASE_URL> -f supabase/tests/rls_verification.sql
```

Env vars used by the app (already present pattern): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` in `apps/web/.env`. **No credentials in this track.**

---

## What could not be verified

| Check | Status |
|---|---|
| Apply migrations to live project | **Not done** — brief forbids deploy/link; owner applies |
| Live RLS script against hosted DB | **Not run** — requires linked DB + fixture users |
| `supabase start` / Docker Postgres parse | **Not possible here** — Docker is not installed on the agent host; CLI is present (`npx supabase` 2.109.1) but cannot start a local DB |
| SQL static review | **Done** — all required tables/indexes/RLS toggles present; `$$` blocks balanced; no embedded credentials (only role names like `service_role` / `authenticated`) |
| End-to-end signup → household row | Requires live Auth after push |

**Do not treat this track as “green in production” until the owner runs `db push` and the RLS script (or a manual cross-user probe).**

---

## Deviations / design notes

1. Remote FKs to `households` / `auth.users` / parent recipes — stricter than local Drizzle (good for server integrity).
2. `visibility` CHECK includes `household` as well as `private` / `public` for future household-shared-not-public recipes.
3. Catalog FKs (`ingredient_forms` → `ingredients`, edges → forms) help seed integrity; local has no FKs.
4. Invite codes are 8-char hex from UUID (not cryptographic secrets); suitable for household sharing, rotate via revoke/`revoked_at`.
5. Multi-membership allowed (user can own a starter household and join another). App should pick “active household”; open whether to auto-retire empty starter households on join.

---

## Open questions

1. **Roles:** SPEC still lists “who may recount” as outstanding — currently any member can INSERT any txn kind. Tighten with role checks later?
2. **Catalog seed on server:** ship via service-role SQL/job, or rely solely on client `@larder/core` seed? Web companion without offline seed needs server catalog.
3. **Active household:** multi-membership UX and whether joining an invite should leave the auto-created empty household.
4. **Email invites:** code path supports `email` lock; actual email delivery (SMTP/magic link) is out of scope — app shares the code for now.
5. **Realtime:** contract mentions optional Realtime; not enabled in migrations.

---

## Sync contract pointer

Full text: **`supabase/SYNC.md`**

- Push: idempotent insert on `(household_id, client_txn_id)`
- Pull: `accepted_at > cursor`
- Fold order ≠ pull order → **`needsRefold` / re-fold**, never assume append-only arrival
- Metadata LWW on `updated_at`; ledger is union-only

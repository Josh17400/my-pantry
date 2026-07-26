# M1 Track G — App data layer

**Date:** 2026-07-26  
**Scope:** `apps/web/src/db/**` (health probe retained), `apps/web/src/state/**`, tests  
**Not touched:** `packages/core/**`, `apps/web/src/ui/**`, `apps/web/src/routes/**`, `native/**`  
**Commits:** none (per brief)

---

## Verification

| Command | Result |
|---|---|
| `npm run typecheck` | zero errors (core + web) |
| `npm run test` | **248** core + **44** web (32 prior + **12** new datalayer) — all green |
| `npm run build` | production build succeeds |

---

## Schema

Drizzle SQLite tables in `apps/web/src/db/schema.ts`:

| Table | Purpose |
|---|---|
| `m0_health_probe` | M0 health check (unchanged semantics) |
| `app_meta` | seed version / fixtures flags |
| `locations` | user-defined, nestable (`parent_id`) |
| `ingredients` | canonical catalog |
| `ingredient_forms` | form + dim + density / gramsPerCount |
| `conversion_edges` | directed graph edges (PK `from_form_id,to_form_id`) |
| `package_specs` | package sizes (PK `form_id,label`) |
| `pantry_items` | **projection cache** (qty from fold, not source of truth) |
| `pantry_txns` | **append-only ledger** |
| `recipes` / `recipe_lines` / `recipe_steps` | recipe CRUD |
| `grocery_lists` / `grocery_list_items` | lists + `shopping_trip_id` |
| `user_aliases` | learned household-scoped matching |

### Indexes (SPEC-mandated)

- `UNIQUE pantry_txn(household_id, client_txn_id)` → `pantry_txn_household_client_uidx`
- `(household_id, ingredient_id, occurred_at)` → `pantry_txn_household_ingredient_occurred_idx`
- `(household_id, accepted_at)` → `pantry_txn_household_accepted_idx` (sync cursor)

### Deviations from SPEC (with reasoning)

1. **Projection stores fold watermarks** (`watermark_cursor`, `last_absolute_cursor`, `is_negative`, `conflict`) on `pantry_items` in addition to SPEC fields. Needed so re-fold / incremental decisions and provenance can be restored without re-scanning the whole log on every paint.
2. **`recipe_lines.group` → column `group_id`**. `group` is awkward in SQL; domain mapping uses `group` in the app layer.
3. **Composite PKs for edges/packages** instead of synthetic ids — domain types have no id field; natural keys are stable from seed.
4. **No FTS yet** for recipe search (SPEC: “Recipe search via FTS locally”). Deferred; title index is present. Next recipe UI track can add FTS.
5. **Default household** is `local-household` until auth/sync lands. Every multi-user field still carries `household_id`.
6. **DB file renamed** from `well-stocked-m0` → `good-pantry` on native (product name). M0 health still works; new file on first native open after update.

---

## Migrations

Real drizzle-kit-style migrations under `apps/web/src/db/migrations/`:

- `0000_m0_health.sql` — health probe
- `0001_product_schema.sql` — product tables
- `meta/_journal.json` — journal entries
- Runtime bodies also in `migrations/sql.ts` (bundled, no FS required on device)

`runMigrations()` (`migrate.ts`):

- Creates `__drizzle_migrations`
- Applies pending tags in order
- Softens `CREATE` for the M0 health table only (legacy inline DDL)
- **Idempotent** — re-run skips applied tags

`drizzle.config.ts` present for future `drizzle-kit generate`.

App start path (native): `repo.initialize()` → open → migrate → seed → optional fixtures.

---

## Projection recompute ↔ `@larder/core`

**Only** `foldLedger` from `@larder/core` computes quantity / provenance.

```
appendTxn(input)
  → INSERT pantry_txns (UNIQUE household+clientTxnId; duplicate = idempotent no-op)
  → recomputeProjection(household, ingredient, form)
       → SELECT all txns for household+ingredient
       → map rows → PantryTxn[]
       → fold = foldLedger(txns)          // ← core, never reimplemented
       → UPSERT pantry_items {
            qtyBase: fold.qtyBase,
            lastVerifiedAt / unverifiedCookCount from fold.provenance,
            watermarkCursor: fold.lastTxnCursor,
            lastAbsoluteCursor, isNegative, conflict
         }
```

Invariant enforced by test: after appends (relative + absolute),  
`pantry_items.qtyBase === foldLedger(listTxnsForIngredient(...)).qtyBase`.

---

## Seeding

`runSeed()` loads from **`packages/core` seed catalog** (~363 ingredients, forms, edges, packages) + default locations:

| Location | Nesting |
|---|---|
| Fridge | root |
| Pantry | root |
| Around the House | root |
| Spices, Tea & Coffee, Baking, Household | children of Around the House |

**Idempotency:**

- `app_meta.seed_version` = `SEED_VERSION` (`1.0.0` from core)
- Matching version → **skip catalog** (no duplicate rows)
- Locations: `app_meta.locations_seeded` + `ON CONFLICT DO NOTHING`
- Force re-seed via `{ force: true }` or bump `SEED_VERSION` in core

**Core gap:** seed is **not** re-exported from `@larder/core` package root. Import is:

```ts
from '../../../../packages/core/src/seed/index.ts'
```

Recommend a follow-up in core: `export * from './seed'` (and recipes/grocery) from `packages/core/src/index.ts`.

---

## Store API (contract for next tracks)

Screens **must** use hooks — never open SQLite directly.

### Boot

```ts
import { createPantryRepository } from '@/db';
import { setActiveRepository } from '@/state';

const repo = createPantryRepository();
await repo.initialize?.({ loadFixtures: import.meta.env.DEV });
setActiveRepository(repo);
```

Web companion throws `NotConfiguredError` (Supabase stub).

### `usePantry()`

| Field / action | Type / behavior |
|---|---|
| `items` | `PantryItemView[]` (joined name, form, location) |
| `selected` | single item or null |
| `loading` / `error` | async UX |
| `householdId` / `setHouseholdId` | multi-user ready |
| `load()` | list all for household |
| `loadByLocation(locationId)` | filter by location |
| `search(query)` | name/form LIKE |
| `getOne(ingredientId, formId)` | detail |
| `upsert(item)` | metadata / placement (par, expiry, location) |
| `appendTxn(txn)` | **ledger append + fold recompute** |

### `useRecipes()`

| Action | Behavior |
|---|---|
| `list()` | summaries |
| `get(id)` | detail with lines + steps |
| `create(recipe)` / `update(id, recipe)` / `remove(id)` | full CRUD |

### `useGrocery()`

| Action | Behavior |
|---|---|
| `load(listId?)` | active list if no id |
| `create(items?)` | new list + `shoppingTripId` |
| `updateItems(items)` | replace lines |
| `checkOff(itemId, checked)` | trip-linked check-off |

### `useLocations()`

| Action | Behavior |
|---|---|
| `list()` / `create` / `update` / `remove` | full CRUD |

### Domain repository (for non-React / advanced)

`repo.domain()` → `DomainRepository` with the same ops plus `listTxnsForIngredient`, `recomputeProjection`, `listUserAliases`, `upsertUserAlias`.

---

## Dev fixtures

`generateDevFixtures(domain, db)` / `initialize({ loadFixtures: true })`:

- **~40 pantry items** across Fridge / Pantry / Spices / Baking / Tea & Coffee / Household
- Mix of **expiring soon**, **LOW** (qty/par under threshold), **OUT** (qty 0)
- Absolute recounts via ledger so projection matches fold
- **4 recipes**: Garlic Butter Pasta, Simple Chicken & Rice, Spinach Scramble, Black Bean Tacos
- Idempotent via `app_meta.fixtures_version = 1.0.0`
- Ingredient/form ids match core seed (`flour-ap`, `egg`, `oil-olive`, …)

---

## Layout

```
apps/web/src/db/
  schema.ts              # all tables
  migrations/            # drizzle-kit SQL + journal + sql.ts
  migrate.ts             # idempotent runner
  seed.ts                # catalog + default locations
  fixtures.ts            # dev demo data
  domain-repository.ts   # product ops + foldLedger
  repository.ts          # PantryRepository interface
  create-repository.ts   # native vs web switch
  drivers/
    native.ts            # Capacitor SQLite + migrate/seed/domain
    web.ts               # NotConfiguredError stub
    node-sqlite.ts       # better-sqlite3 tests only
  datalayer.test.ts      # 12 tests
  health-check.ts        # M0 (migrate message updated)
apps/web/src/state/
  pantry-store.ts        # usePantry
  recipes-store.ts       # useRecipes
  grocery-store.ts       # useGrocery
  locations-store.ts     # useLocations
  repo-context.ts        # setActiveRepository
  index.ts
```

---

## Dependencies added

| Package | Role |
|---|---|
| `zustand` | state stores |
| `better-sqlite3` (+ types) | **dev only** — Node tests |
| `drizzle-kit` | **dev only** — future migration generate |

No other heavy deps.

---

## Open questions

1. **Export seed/recipes/grocery from `@larder/core` root** so app code does not deep-import `packages/core/src/seed`.
2. **Form-level vs ingredient-level fold:** core `foldLedger` is per ingredient log. We store projection rows per `(ingredient, form)` and fold all txns for the ingredient when any form’s txn arrives. Confirm if multi-form stock should be split into separate fold keys later.
3. **When to call `initialize` in the shell** — not wired into `main.tsx` (no product screens yet). Next track should boot native DB before pantry routes.
4. **Web Supabase driver** remains stub; product web needs remote schema + RLS before online companion works.
5. **Recipe FTS** deferred (see deviations).
6. **Seed aliases** stay in core memory (on `SeedIngredient.aliases`); only **user** aliases hit `user_aliases`. Matching catalog assembly for the app is still a follow-up.
7. **DB rename** `good-pantry` drops old `well-stocked-m0` file on devices that already ran M0 — acceptable for pre-release.

---

## Test coverage (new)

`apps/web/src/db/datalayer.test.ts`:

- Migrations apply; second run idempotent; health probe still works
- Seed loads catalog; second seed skips; no duplicate ingredients/locations
- `appendTxn` → projection **exactly** equals `foldLedger`
- Duplicate `clientTxnId` is idempotent
- Recipe create/get/update/delete with lines + steps
- Locations CRUD, grocery list + check-off
- Pantry upsert / by-location / search
- `initialize({ loadFixtures: true })` + fixture skip on re-run

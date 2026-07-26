# Local SQLite ↔ remote Postgres parity

**Local authority:** `apps/web/src/db/schema.ts`  
**Remote authority:** `supabase/migrations/20260726100000_schema.sql`

Silent drift between these is a multi-device bug factory. Update this file when either side changes.

Legend: **OK** = same semantics · **MAP** = intentional type/shape map · **SERVER** = server-only · **LOCAL** = local-only · **DRIFT** = problem

---

## Tables overview

| Table | Local | Remote | Status |
|---|---|---|---|
| `m0_health_probe` | yes | no | **LOCAL** — shell probe only |
| `app_meta` | yes | no | **LOCAL** — seed version / flags |
| `households` | no | yes | **SERVER** — multi-user |
| `household_members` | no | yes | **SERVER** |
| `household_invites` | no | yes | **SERVER** — invite path |
| `locations` | yes | yes | **OK** |
| `ingredients` | yes | yes | **MAP** — types |
| `ingredient_forms` | yes | yes | **MAP** — types + FK on remote |
| `conversion_edges` | yes | yes | **MAP** — boolean / FK |
| `package_specs` | yes | yes | **MAP** — FK on remote |
| `pantry_items` | yes | yes | **MAP** — timestamps |
| `pantry_txns` | yes | yes | **MAP** — see ledger |
| `recipes` | yes | yes | **MAP** — tags jsonb; visibility enum-ish |
| `recipe_lines` | yes | yes | **MAP** — jsonb / boolean |
| `recipe_steps` | yes | yes | **OK** |
| `grocery_lists` | yes | yes | **MAP** — timestamps |
| `grocery_list_items` | yes | yes | **MAP** — jsonb / boolean |
| `user_aliases` | yes | yes | **MAP** — timestamps |

---

## Column parity (product tables)

### locations

| Column | Local | Remote | Notes |
|---|---|---|---|
| id | text PK | text PK | OK |
| household_id | text | text FK→households | MAP (FK remote only) |
| name | text | text | OK |
| icon | text | text | OK |
| tint | text | text | OK |
| parent_id | text? | text? FK→locations | MAP |
| sort_order | integer | integer | OK |

### ingredients

| Column | Local | Remote | Notes |
|---|---|---|---|
| id | text PK | text PK | OK |
| name | text | text | OK |
| category | text | text | OK |
| allergens | text (JSON) | jsonb | **MAP** — wire as JSON array |
| is_staple | integer bool | boolean | **MAP** |
| default_form_id | text | text | OK (no FK either side) |

### ingredient_forms

| Column | Local | Remote | Notes |
|---|---|---|---|
| id | text PK | text PK | OK |
| ingredient_id | text | text FK | MAP |
| form | text | text | OK |
| dim | text | text + CHECK | MAP |
| density_g_per_ml | real | double precision | MAP |
| grams_per_count | real | double precision | MAP |
| uncertainty_pct | real | double precision | MAP |

### conversion_edges

| Column | Local | Remote | Notes |
|---|---|---|---|
| from_form_id | text PK part | text PK + FK | MAP |
| to_form_id | text PK part | text PK + FK | MAP |
| factor | real | double precision | MAP |
| uncertainty_pct | real | double precision | MAP |
| source | text | text | OK |
| one_way | integer bool default 0 | boolean default false | **MAP** |

### package_specs

| Column | Local | Remote | Notes |
|---|---|---|---|
| form_id | text PK part | text PK + FK | MAP |
| label | text PK part | text PK | OK |
| net_g | real | double precision | MAP |
| drained_g | real? | double precision? | MAP |

### pantry_items

| Column | Local | Remote | Notes |
|---|---|---|---|
| household_id | text PK | text PK + FK | MAP |
| ingredient_id | text PK | text PK | OK |
| form_id | text PK | text PK | OK |
| location_id | text? | text? | OK |
| qty_base | real | double precision | MAP |
| dim | text | text | OK |
| par_level_base | real | double precision | MAP |
| low_threshold_pct | real | double precision | MAP |
| last_verified_at | text? ISO | timestamptz? | **MAP** |
| unverified_cook_count | integer | integer | OK |
| opened_at | text? | timestamptz? | **MAP** |
| expires_at | text? | timestamptz? | **MAP** |
| updated_at | text | timestamptz | **MAP** — LWW key |
| watermark_cursor | text? | text? | OK |
| last_absolute_cursor | text? | text? | OK |
| is_negative | integer bool | boolean | **MAP** |
| conflict | integer bool | boolean | **MAP** |

### pantry_txns

| Column | Local | Remote | Notes |
|---|---|---|---|
| id | text PK | text PK | OK |
| client_txn_id | text | text | OK |
| household_id | text | text FK | MAP |
| ingredient_id | text | text | OK |
| form_id | text | text | OK |
| kind | text | text + CHECK | MAP |
| delta_base | real? | double precision? | MAP |
| target_base | real? | double precision? | MAP |
| basis_cursor | text? | text? | OK |
| reason | text | text | OK |
| ref_id | text? | text? | OK |
| unit_price | real? | double precision? | MAP |
| occurred_at | text | timestamptz | **MAP** — client clock |
| accepted_at | text? nullable | timestamptz **NOT NULL DEFAULT now()** | **MAP** — local null until sync |
| device_id | text | text | OK |
| user_id | text | **uuid** FK→auth.users | **MAP** — local may use string until auth |

**Indexes (both sides):**

| Index | Local | Remote |
|---|---|---|
| UNIQUE (household_id, client_txn_id) | yes | yes |
| (household_id, ingredient_id, occurred_at) | yes | yes |
| (household_id, accepted_at) | yes | yes |

**Append-only:** local by convention; remote by **trigger + no RLS update/delete**.

### recipes

| Column | Local | Remote | Notes |
|---|---|---|---|
| id | text PK | text PK | OK |
| household_id | text? | text? FK | MAP |
| title | text | text | OK |
| servings | real | double precision | MAP |
| yield_note | text? | text? | OK |
| prep_min | integer? | integer? | OK |
| cook_min | integer? | integer? | OK |
| author_id | text? | uuid? FK | **MAP** |
| visibility | text default private | text + CHECK (private\|household\|public) | MAP — local allows free string |
| forked_from | text? | text? | OK |
| tags | text JSON? | jsonb? | **MAP** |
| image_url | text? | text? | OK |
| created_at | text | timestamptz | **MAP** |
| updated_at | text | timestamptz | **MAP** — LWW |

### recipe_lines

| Column | Local | Remote | Notes |
|---|---|---|---|
| id | text PK | text PK | OK |
| recipe_id | text | text FK | MAP |
| sort_order | integer | integer | OK |
| ingredient_id | text? | text? | OK |
| form_id | text? | text? | OK |
| raw_text | text | text | OK |
| qty | real? | double precision? | MAP |
| unit | text? | text? | OK |
| optional | integer bool | boolean | **MAP** |
| group_id | text? | text? | OK (SPEC “group”) |
| substitutes | text JSON? | jsonb? | **MAP** |
| unknown_allergens | integer bool | boolean | **MAP** |
| non_quantified | integer bool | boolean | **MAP** |
| qty_high | real? | double precision? | MAP |
| qty_low | real? | double precision? | MAP |
| is_range | integer bool | boolean | **MAP** |

### recipe_steps

| Column | Local | Remote | Notes |
|---|---|---|---|
| id | text PK | text PK | OK |
| recipe_id | text | text FK | MAP |
| sort_order | integer | integer | OK |
| text | text | text | OK |
| duration_sec | integer? | integer? | OK |
| timer_label | text? | text? | OK |

### grocery_lists

| Column | Local | Remote | Notes |
|---|---|---|---|
| id | text PK | text PK | OK |
| household_id | text | text FK | MAP |
| shopping_trip_id | text | text | OK |
| created_at | text | timestamptz | **MAP** |
| updated_at | text | timestamptz | **MAP** |

### grocery_list_items

| Column | Local | Remote | Notes |
|---|---|---|---|
| id | text PK | text PK | OK |
| list_id | text | text FK | MAP |
| shopping_trip_id | text | text | OK |
| ingredient_id | text? | text? | OK |
| form_id | text? | text? | OK |
| name | text | text | OK |
| category | text | text | OK |
| qty_base | real? | double precision? | MAP |
| dim | text? | text? | OK |
| display_qty | text | text | OK |
| sources | text JSON? | jsonb? | **MAP** |
| recipe_ids | text JSON? | jsonb? | **MAP** |
| checked | integer bool | boolean | **MAP** |
| sort_order | integer | integer | OK |
| notes | text? | text? | OK |

### user_aliases

| Column | Local | Remote | Notes |
|---|---|---|---|
| id | text PK | text PK | OK |
| household_id | text | text FK | MAP |
| alias | text | text | OK |
| ingredient_id | text | text | OK |
| created_at | text | timestamptz | **MAP** |
| UNIQUE (household_id, alias) | yes | yes | OK |

---

## Intentional deviations (not bugs)

1. **Server tables** `households`, `household_members`, `household_invites` — multi-user; local still uses `local-household` until sync track wires auth.
2. **`accepted_at` NOT NULL + DEFAULT now()** on server; local nullable until ack.
3. **`user_id` / `author_id` as uuid** on server to match `auth.users`.
4. **jsonb / boolean / timestamptz** instead of SQLite text/integer idioms.
5. **FKs and CHECKs** on remote for integrity; local Drizzle schema is lighter.
6. **Append-only triggers** only on remote (local enforces in repository).
7. **No** `app_meta` / health probe on remote.

## Open drift risks for the sync client

- Map `user_id: string` ↔ uuid string carefully (same hex form).
- Serialize ISO timestamps with timezone; prefer always `Z` / offset so `timestamptz` round-trips.
- JSON columns: parse jsonb arrays on pull; stringify for local text columns if still text in SQLite.
- Boolean 0/1 vs true/false at the mapper layer.

## How to re-check

```text
1. Diff apps/web/src/db/schema.ts against this file’s column lists.
2. Diff supabase/migrations/*_schema.sql CREATE TABLE blocks.
3. Any new local column without a remote twin → flag DRIFT before shipping sync.
```

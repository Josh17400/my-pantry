# Fix: Locations IA — Freezer in, Around the House folded into Pantry

**Date:** 2026-07-26  
**Scope:** `apps/web/src/db/**`, `apps/web/src/features/home/**`, `apps/web/src/features/pantry/**`  
**Out of scope (untouched):** `packages/core/**`, `supabase/**`, `native/**`, `apps/web/src/features/recipes/**`

---

## New tree

```
Fridge    (root)   loc-fridge    sort 0
Freezer   (root)   loc-freezer   sort 1   ← new
Pantry    (root)   loc-pantry    sort 2
  ├── Spices          loc-spices       sort 3  (was under Around the House)
  ├── Tea & Coffee    loc-tea-coffee   sort 4
  ├── Baking          loc-baking       sort 5
  └── Household       loc-household    sort 6
```

**Removed entirely:** `loc-around-house` (“Around the House”) and the virtual **Favorites** glance card.

Canonical definition lives in `apps/web/src/db/default-locations.ts` (shared by seed, dev driver, and demo data).

---

## Migration

### Why not SQL schema migration

Locations are **data**, not schema. Existing installs already have rows under `loc-around-house`. A seed-list change alone (`onConflictDoNothing` + `locations_seeded=1`) would leave orphans and hide items.

### Approach

| Piece | Role |
|---|---|
| `LOCATIONS_TREE_VERSION = '2'` | Tree shape version (independent of core `SEED_VERSION` — we cannot touch `packages/core`) |
| `META_LOCATIONS_TREE_VERSION` | `app_meta` key; migration is a one-shot |
| `applyLocationsTreeMigration` | Pure transform for tests + IndexedDB dev driver |
| `migrateLocationsTree` | Drizzle/SQLite path used by native + node drivers via `runSeed` |

### Steps when version is stale

1. Reparent any location with `parent_id = loc-around-house` → `loc-pantry`
2. Move any `pantry_items` with `location_id = loc-around-house` → `loc-pantry`
3. Align known default ids (parent, sortOrder, name/icon/tint)
4. Delete `loc-around-house`
5. Ensure Freezer (and all other defaults) exist
6. Stamp `locations_tree_version = 2`

`runSeed` always calls the migration after inserting missing defaults, so both fresh and upgraded installs land on the same tree.

### Tests (`locations-migration.test.ts`)

- **Pure:** old shape → no orphans, no lost items, Freezer present, 4 children reparented, direct around-house item moved to pantry
- **SQLite:** insert old tree + items, run `migrateLocationsTree`, assert no `loc-around-house`, items preserved, second run is a no-op
- **Fresh seed:** Fridge / Freezer / Pantry roots; Pantry children Spices, Tea & Coffee, Baking, Household

---

## Home — At a Glance layout

**Cards:** Fridge · Freezer · Pantry (Favorites gone).

**Layout (deliberate, no ragged gap):** `grid-cols-2` with **Pantry spanning full width** (`col-span-2`) when there are exactly three cards:

```
┌──────────┐ ┌──────────┐
│  Fridge  │ │ Freezer  │
└──────────┘ └──────────┘
┌───────────────────────┐
│        Pantry         │
└───────────────────────┘
```

Marked with `data-glance-layout="pantry-span"`. Empty-state placeholders match the same shape.

Each card navigates to `/pantry?location=<id>`. Counts roll up children (Pantry count includes Spices/Baking/etc.).

---

## Freezer tint vs warm palette

DESIGN.md: warmth is the rule; cool grays break; location washes are soft sage/tan/**sky**/cream. Sky is already a warm-shifted blue-gray (`#CCD4D4`).

| Surface | Choice | Rationale |
|---|---|---|
| Seed / row tint | **`#5E7A86`** frost slate | Cooler and slightly deeper than Fridge’s `#6B8F9C`, but desaturated with a warm-gray cast — not pure tech blue |
| Glance card wash | **`sky`** | Same soft wash as Fridge so cold storage reads as a family without introducing a new cool token |

---

## Location dropdown + pantry grouping

- `locationSelectOptions()` — roots by sortOrder, children indented as `↳ Name` under their parent (Add Item sheet, edit location).
- `expandLocationScope()` — parent filter = parent + direct children. **Opening Pantry includes Spices/Baking/etc.**; list still groups under child headers so sub-locations are not silos.

Favorites filter path (`?filter=favorites`) removed from pantry/home; dead code cleaned.

---

## Demo fixtures (`FIXTURES_VERSION` → `1.1.0`)

Freezer items (so the Freezer card is not empty):

- Frozen peas, chicken breast, frozen berries, ice cream

Household granola bars remain under `loc-household` (now a Pantry child). Fresh chicken moved off the fridge fixture set into freezer for a more realistic split.

---

## Assertions changed (not deleted)

| Location | What changed | Why |
|---|---|---|
| `scripts/verify-interactivity.mjs` | Replaced glance clicks for **Around the House** and **Favorites** with **Freezer** | Cards no longer exist; Freezer is the third root |
| `filter-group.test.ts` | Extended location fixtures with Freezer + Pantry children; **added** dropdown + parent-scope tests | Cover hierarchy and parent-includes-children (new requirements) |
| `home-display.test.ts` | **Added** demo tree assertions (roots, no around-house, freezer stock ≥ 4) | Lock demo/IA shape without weakening cook-now tests |
| `datalayer.test.ts` | Still expects **7** locations | Count unchanged (around-house out, freezer in) — no assertion delete |
| LocationsScreen copy | “Spices under Around the House” → “under Pantry” | Docstring/UI string match new tree |

No failing checks were deleted without replacement. Glance interactivity still asserts three navigations (Fridge, Freezer, Pantry).

---

## New tests added

1. Migration pure + SQLite (old → new, no orphans, no lost items, idempotent)
2. `locationSelectOptions` lists Pantry children indented after Pantry
3. `expandLocationScope` + filtered pool keeps child items under parent view
4. Demo tree / freezer fixture stock

**Counts:** core **279** green · web **252** green (was 244; +8 from migration/filter/demo coverage).

---

## Verification

```
npm run typecheck   ✅
npm run lint        ✅
npm run test        ✅  252 web
core test           ✅  279
npm run build       ✅
node scripts/verify-interactivity.mjs  ✅
node scripts/verify-chrome.mjs         ✅
```

---

## Deviations

1. **No SQL journal migration** — tree change is a **data** migration versioned with `locations_tree_version`, not a drizzle schema tag. Core `SEED_VERSION` was not bumped (packages/core is read-only).
2. **Favorites filter** fully removed from home/pantry (not kept as a hidden query). Brief asked to replace the Favorites **card**; keeping a dead `?filter=favorites` path would confuse.
3. **Chicken breast** demo stock lives in Freezer only (was fridge) so Freezer feels real and fridge isn’t double-counting protein.

---

## Open questions

1. Should user-created locations that parented under Around the House (if any) also be reparented? Current migration reparents **all** children of `loc-around-house`, which covers that case.
2. DESIGN.md still documents the mockup-era “Around the House + Favorites” IA — out of scope for this brief; may want a follow-up doc pass so design docs match product.
3. Deep nesting beyond one level is still unsupported (existing LocationsScreen rule); Pantry children are direct only.

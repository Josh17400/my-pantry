# Fix: Native SQLite proxy column-name collision (“Fridge” pantry titles)

**Date:** 2026-07-27  
**Scope:** `apps/web/src/db/drivers/native.ts`, `native-proxy-rows.ts` (new), `domain-repository.ts`, tests under `apps/web/src/db/`  
**No commits** (per brief).

---

## Mechanism chosen (and why)

### Primary: positional SELECT rewrite in the proxy (`native-proxy-rows.ts`)

Before every non-`run` query, the native Drizzle sqlite-proxy callback runs
`prepareProxySelect(sql)`:

1. Parse the main `SELECT` list (handles optional `DISTINCT`/`ALL` and `WITH` CTEs).
2. Rewrite every result expression to a unique alias:  
   `expr AS "__gp_0"`, `expr AS "__gp_1"`, …
3. Execute the rewritten SQL on Capacitor.
4. Rebuild positional arrays by reading `__gp_0` … `__gp_N-1` from each row object
   (order is structural — not `Object.values` insertion order).

**Why this and not “only alias the three pantry joins”:**

- Capacitor Android/iOS build rows as `JSObject` / `[String: Any]` keyed by bare
  column name (`Database.java` / `UtilsSQLCipher.fetchColumnInfo`). Duplicate
  bare names **destroy values before JS sees them**. Recovery from a collapsed
  object is impossible.
- Drizzle’s JS-side select keys (`ingredientName: ingredients.name`) do **not**
  become SQL aliases; `.toSQL()` still emits two `"name"` outputs. Aliasing must
  happen in SQL **before** Capacitor materializes the row.
- Auto-rewriting every SELECT makes collisions **structurally impossible** for
  any current or future joined query, not only the three known pantry paths.
- Capacitor has no API that returns pure positional value arrays for
  `conn.query()` (only object rows / `values: any[]` of objects). Positional
  reconstruction via unique aliases is the next-best contract match for
  drizzle-orm/sqlite-proxy.

### Secondary: explicit SQL aliases on pantry joins (`domain-repository.ts`)

`listPantryItems` / `getPantryItem` now select:

```ts
ingredientName: sql<string | null>`${ingredients.name}`.as('ingredient_name'),
formName: sql<string | null>`${ingredientForms.form}`.as('form_name'),
locationName: sql<string | null>`${locations.name}`.as('location_name'),
```

Defense in depth and clarity if a call path ever skips the rewrite. The proxy
still re-aliases these to `__gp_N` so order stays positional.

### Loud failure (requirement 3)

`ProxyColumnMismatchError` is thrown when:

- an object row is missing expected `__gp_N` keys, or
- (fallback without rewrite) `Object.entries` length ≠ expected result-column count, or
- an array row’s length ≠ expected count.

The error message includes the SQL text. Silent short arrays are never returned.

iOS’s sentinel first row `{ ios_columns: string[] }` is stripped before
normalization (Capacitor injects it; previously it would have been treated as data).

---

## Joined-select audit

### `domain-repository.ts`

| Call site | Joins | Same-named columns in SELECT? | Affected? | Action |
|-----------|--------|-------------------------------|-----------|--------|
| `listPantryItems` | ingredients, ingredient_forms, locations | `ingredients.name` + `locations.name` | **Yes** | SQL aliases + proxy rewrite |
| `getPantryItem` | same | same | **Yes** | same (`pantryItemViewSelect()`) |
| `searchPantryByName` | none of its own | N/A | Indirectly (calls `listPantryItems`) | Fixed via list |
| `listPantryByLocation` | none of its own | N/A | Indirectly | Fixed via list |
| `ensureCatalogRows` | none | single-table selects | No | — |
| Locations / ledger / recipes / grocery / aliases | none with multi-table same-name outputs | No joins drawing colliding columns | No | — |

Only two `.leftJoin` clusters exist in this file (both pantry view selects). No
`.innerJoin` elsewhere in `apps/web/src/db/`.

### Other db-layer drivers

| Driver | Joined selects | Collision risk |
|--------|----------------|----------------|
| `dev.ts` | Hand-built views | Unaffected (not SQL proxy) |
| `node-sqlite.ts` / better-sqlite3 | Uses native array mapping via Drizzle | Unaffected |
| `web.ts` | Supabase path | Out of scope |

---

## Proof the regression fails without the fix

### 1. Legacy `Object.values` on a collapsed Capacitor-shaped row

Documented in `native-proxy-rows.test.ts` (“legacy Object.values maps location
name into the ingredient slot”) and reproduced on the CLI:

```
LEGACY_FAIL_PROOF {
  length: 19,                    // expected 20
  pos17_ingredientSlot: 'Fridge', // expected 'Cucumber'
  pos18_form: 'each',
  pos19_locationSlot: undefined,  // expected 'Fridge'
}
```

That is exactly the owner report: title = location name, location field null so
the `PantryItemRow` name===location guard cannot fire.

### 2. better-sqlite3 object mode (Capacitor-equivalent collapse)

```
select ingredients.name, locations.name …
→ [ { name: 'Fridge' } ]   // one key; Cucumber discarded
```

### 3. Loud path

`normalizeProxyRows(sql, [{ name: 'Fridge', form: 'each' }], 3)` throws
`ProxyColumnMismatchError` with expected=3, actual=2, SQL in message.

### 4. Fixed path

After rewrite + `__gp_N` keys, positions 17 and 19 are `Cucumber` / `Fridge`.

### 5. Full DomainRepository round-trip

Fake Capacitor connection = better-sqlite3 **object** mode + `createProxyDb`:
upsert cucumber into Fridge → `listPantryItems` / `getPantryItem` return
`ingredientName: 'Cucumber'`, `locationName: 'Fridge'`.

---

## Files changed

| File | Change |
|------|--------|
| `apps/web/src/db/drivers/native-proxy-rows.ts` | **New** — rewrite, normalize, mismatch error |
| `apps/web/src/db/drivers/native.ts` | Use prepare/normalize; export `createProxyDb` + `ProxySqliteConnection` |
| `apps/web/src/db/domain-repository.ts` | `pantryItemViewSelect()` with SQL aliases |
| `apps/web/src/db/drivers/native-proxy-rows.test.ts` | **New** — 12 regression tests |

---

## Verification (ran locally)

```
npm run typecheck   # pass (@larder/core + @larder/web)
npm run lint        # pass
npm run test        # pass
npm run build       # pass (tsc --noEmit && vite build)
```

### Suite counts observed

| Workspace | Test files | Tests |
|-----------|------------|-------|
| `@larder/core` | 30 passed | **315** passed |
| `@larder/web` | 30 passed | **345** passed |
| **Total** | 60 | **660** |

New file: `native-proxy-rows.test.ts` — **12** tests, all green.  
`dev.test.ts` and better-sqlite3 `datalayer.test.ts` stayed green (working paths
unchanged in behavior).

---

## Adjacent issues found but **not** fixed

1. **`PantryItemRow.tsx` display-layer guard** — still present (`name === location`
   → “Unknown item”). Brief forbids fixing UI; data layer is the real fix. Guard
   is now able to fire when `locationName` is correctly populated (e.g. bad
   catalogue data that literally equals the location title).

2. **`createExecutor().selectObjects` in `native.ts`** — still prefers raw object
   rows for migrations/health. Migration SQL in this repo is single-table /
   non-colliding. Not rewritten. If a future migration joins same-named columns
   into object rows, it could mis-key; leave for a dedicated migration path.

3. **Drizzle proxy `method === 'get'` row shape** — drizzle-orm maps `get` as a
   single flat value array, while this driver always returns `unknown[][]` for
   query methods (pre-existing). Product code uses `all` via `.select()` await;
   not changed.

4. **Compound `UNION` / `SELECT *`** — rewrite returns `null`; loud failure still
   applies when column counts can be inferred. No product queries use these today.

5. **Stored data** — never wrong; only the read path. No migration needed.

---

## Flagged judgment calls

- **Rewrite over Capacitor positional API:** Capacitor does not expose positional
  result arrays for `query()`; rewrite is the structural fix.
- **Domain aliases kept despite rewrite:** redundant but cheap, documents the
  contract, and helps any non-rewrite consumer of the SQL text.
- **UNION skipped in rewrite:** prefer loud failure over incorrect multi-select
  rewriting; no current product SQL hits this.

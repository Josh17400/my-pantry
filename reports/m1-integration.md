# M1 Integration Report

**Date:** 2026-07-25  
**Scope:** `packages/core` — domain types, A/B seam, root barrel, four change requests  
**Verification:** `npm run typecheck` clean (full workspace); `npm run test` **130/130 green**  
**Commits:** none (per brief)

---

## 1. Domain type layout and boundaries

### Layout

```
packages/core/src/domain/
  types.ts        Ingredient, IngredientForm, ConversionEdge, PackageSpec,
                  Location, Dimension, BaseUnit, QtyBase
  allergens.ts    Allergen enum/const, AllergenTags, disagree / auto-merge helpers
  index.ts        public barrel
```

### Why these boundaries

| Module | Owns | Does not own |
|---|---|---|
| **`domain/`** | Vocabulary / shapes (what things *are*) | Math, I/O, ledger fold |
| **`units/`** | Unit registry, convert graph, parse/format | Canonical form/edge/ingredient shapes |
| **`pantry/`** | Ledger fold, projection, par, stock | Unit conversion, ingredient catalog |

Track A had been defining `IngredientForm` / `ConversionEdge` / `PackageSpec` locally; those moved to `domain/`. Units re-exports them for convenience so existing `from '../../src/units'` imports in tests keep working, but the **single home** is `domain/`.

`Dimension` and `BaseUnit` also live in `domain/` because every downstream module needs them and the brief requires exactly one definition. `QtyBase` lives there too (pantry previously inlined a structural twin).

### Allergens (safety system)

- Canonical list: milk, egg, fish, shellfish, tree_nut, peanut, wheat, soy, sesame.
- `AllergenTags` discriminated union:
  - `{ unknownAllergens: false; allergens }` — closed known tags
  - `{ unknownAllergens: true; allergens? }` — unmatched free text (unsafe)
- `allergensDisagree` / `canAutoMergeAllergens` — refuse auto-merge when tags differ **or** either side is unknown. Matching can call these without inventing rules.

`Ingredient` carries `allergens: readonly Allergen[]` (closed). Free-text recipe lines will use `unknownAllergenTags()` at match time (downstream).

---

## 2. A/B seam closed

Track B had:

```ts
type Dimension = 'mass' | 'volume' | 'count';
type QtyBase = { qtyBase: number; dim: Dimension };
```

**Now:** `pantry/types.ts` imports `Dimension` and `QtyBase` from `../domain/types` and re-exports them. No local structural duplicate remains.

### Grep — single `Dimension` definition

```
packages/core/src/domain/types.ts
  export type Dimension = 'mass' | 'volume' | 'count';
```

No other `type Dimension = …` in the codebase. Units and pantry only re-export.

### Grep — no React under core

```
No matches for react / react-native imports under packages/core
```

---

## 3. Root barrel public surface

`packages/core/src/index.ts` exports:

1. **M0 health** — `CORE_PACKAGE_NAME`, `coreHealth`, sqlite-health helpers  
2. **domain** — types + allergen helpers (canonical home for shared shapes)  
3. **units** — registry, convert, parse, format (math surface only)  
4. **pantry** — fold, projection, provenance, par, stock  

### Collisions resolved deliberately

| Identifier | Conflict | Resolution |
|---|---|---|
| `Dimension` | domain + units + pantry | Root exports **only from domain** |
| `BaseUnit` | domain + units | Root exports **only from domain** |
| `IngredientForm`, `ConversionEdge`, `PackageSpec` | domain + units | Root exports **only from domain** |
| `QtyBase` | domain + pantry | Root exports **only from domain** |

Units/pantry barrels still re-export their local convenience copies so deep imports (`@larder/core` subpaths via relative test imports) keep working. The root package surface is non-shadowing.

---

## 4. Change requests

### (a) Bidirectional conversion edges

**Done.**

- `ConversionEdge.oneWay?: boolean` (default false / omitted).
- `convert()` adjacency = declared edges **plus** inverse `1/factor` for every edge where `oneWay` is not true.
- Inverse path keys: `B->A~inv` (and `B->A~inv|disambig` when the forward key was disambiguated) via `inverseEdgeKey()`.
- Inverse carries the same `uncertaintyPct`.
- Synthetic inverses are marked `oneWay: true` so they are not re-inverted if edges are ever reprocessed.

**Tests** (`test/units/graph.test.ts`):

- Declared A→B walkable as B→A with `~inv` path key and same uncertainty.
- `oneWay: true` (chicken whole → boneless) does not invert.
- Inverse-edge ties: equal hops + equal unc → lex-smallest path key, stable across edge-array shuffles (15 iterations).
- Explicit reverse preferred over auto-inverse when both exist (`B->A` < `B->A~inv`).

Existing deterministic tie-break tests (forward-only graph) still pass unchanged.

### (b) Ranges expose low / high

**Done.**

`parseQuantity("2-3 cloves")` returns:

```ts
{ kind: 'quantity', qty: 2.5, low: 2, high: 3, isRange: true, … }
```

Non-ranges set `low === high === qty`. Reversed input `"3-2"` normalizes `low ≤ high`. Callers choose: grocery → `high`, pantry deduct → `qty` (midpoint).

**Tests** updated/added in `test/units/parse.test.ts`.

### (c) `ambiguousLocale` flag

**Done.**

- `UnitDef.ambiguousLocale?: boolean` set on: `pint`, `quart`, `gallon`, `fl oz`, `cup`.
- Surfaced on `ParsedQuantity.ambiguousLocale`.
- Does not reject; does not change factors (still US customary).

**Tests** for ambiguous vs metric/mass vs unknown unit tokens.

### (d) Terminology fix (customary vs legal cup)

**Done — comments only, math unchanged.**

- `factors.ts` header, cup entry comment, and `EXACT.CUP_TO_ML` doc: **US customary** cup (1/16 gal = 236.5882365 ml).
- Note added: FDA **legal** cup is 240 ml; nutrition panels need a separate unit id, not a redefinition of `cup`.
- Test title updated: “US customary cup”.

---

## 5. Conflict-reporting limitation

**Documented, not fixed.**

`detectAbsoluteConflicts` in `pantry/fold.ts` compares each prior absolute only against the **winner** (last in total order). Comment block documents the A1/A2/A3 case: when A3 observed A2 but A2 never observed A1, the genuine A1/A2 conflict is not reported. Quantity remains correct (checkpoint fold).

**Why not fix now:** a full pairwise scan would expand when `conflict === true` without changing `qtyBase`. That changes FoldResult / UI signal semantics and would require deliberate product agreement plus property-test updates. Brief forbids silently changing fold semantics. Left documented.

---

## 6. Existing tests whose expectations changed

| Test | Old expectation | New expectation | Why |
|---|---|---|---|
| `graph.test.ts` → cyclic graph path | `path = ['A->B','B->C']` | `path = ['A->C~inv']` | Declared edge C→A (factor 1/6) auto-inverts to A→C (factor 6). Fewest-hops tie-break correctly prefers the 1-hop inverse over the 2-hop forward path. **Value still 6.** Legitimate CR(a) consequence. |
| `factors.test.ts` cup title | “US legal cup” | “US customary cup” | Terminology only (CR d). |
| `parse.test.ts` ranges | midpoint + isRange only | also asserts `low` / `high` | CR(b). |

No tests were silently rewritten to greenwash behavior. All 110 prior tests still pass under the new surface; additions bring the suite to **130**.

---

## 7. Deviations

None material.

- `QtyBase` fields made `readonly` in the domain definition (stricter, compatible).
- Range parsing normalizes order (`low = min`, `high = max`) so reversed `"3-2"` is well-defined — not specified in the brief but required for safe callers.

---

## 8. Open questions (stated, not guessed)

1. **Pairwise absolute conflict reporting** — when should we expand `detectAbsoluteConflicts`? Product may want intermediate conflicts even when the final winner is clean; that is a FoldResult semantics change.
2. **`legal_cup` unit id** — deferred until nutrition-panel parsing exists. Confirm naming (`legal_cup` vs `cup_legal` vs `metric_label_cup`) at that time.
3. **Recipe line type** — SPEC’s `Recipe.ingredients[]` shape (with `unknownAllergens` per line) is not yet a domain type; only `Ingredient` + allergen helpers landed. Confirm whether M1 seed/matching track should own `Recipe` / `RecipeLine` next, or a follow-up domain PR.
4. **Dual export of shapes** — units barrel still re-exports `IngredientForm` etc. for test convenience. Prefer eventually deep-importing from `domain` only? Cosmetic; no runtime cost.
5. **Explicit + inverse parallel edges** — when seed data later emits both directions *and* we auto-invert, two parallel arcs exist. Tie-break is deterministic today; seed policy (emit one direction only) is recommended but not enforced.

---

## Verification evidence

```
npm run typecheck   # zero errors (@larder/core + @larder/mobile)
npm run test        # 16 files, 130 tests passed
```

Grep:

- Single definition: `export type Dimension = 'mass' | 'volume' | 'count'` in `src/domain/types.ts` only.
- No `react` / `react-native` imports under `packages/core`.

# M1 Track A — Units, forms, and the conversion graph

**Package:** `@larder/core` · **Scope:** `packages/core/src/units/**`, `packages/core/test/units/**`  
**Status:** Implementation complete. Units typecheck clean; units + M0 tests green. Full-package `npm run typecheck` / `npm run test` are red only because **Track B (`src/pantry/`) is mid-flight in parallel** — not caused by this track.

---

## Conversion-graph design

### Model

- Three dimensions with canonical bases: **mass → g**, **volume → ml**, **count → each**.
- Quantities are always numbers in a base unit + dimension. Never a display string.
- **Form** is a first-class axis (`IngredientForm`): density and grams-per-count live on the form, not the ingredient.
- **Edges** (`ConversionEdge`) are directed: `toBase = fromBase * factor`, with per-edge `uncertaintyPct` and `source`.
- **`PackageSpec`** is typed for seed/par use (`formId`, `label`, `netG`, optional `drainedG`); no runtime logic in this track.

### `convert()` behavior

| Case | Requirement |
|---|---|
| Same dimension, no form hop | Universal unit math (g↔lb). Uncertainty 0. Path `[]`. |
| Cross-dimension, single form | Uses `densityGPerMl` and/or `gramsPerCount`. Adds form `uncertaintyPct`. |
| Form A → form B | Graph walk over declared edges only. No edge → `{ ok: false, reason: 'no-path' }`. |
| Unknown unit / form / non-finite | Discriminated failure — **never throws**, **never guesses**. |

Edge keys in `path` are stable strings: `fromFormId->toFormId` (disambiguated with `|source` / `|factor` when duplicate endpoints exist). Density bridges appear as `density:<formId>` or `count-mass:<formId>`.

### Uncertainty accumulation

Percentages are **added** along the path (and once for a density/count bridge).  
Rationale: conservative, simple, and **strictly increases** on multi-hop when each hop has `uncertaintyPct > 0` (required by tests). RSS would also work statistically but can under-report on correlated culinary estimates.

### Deterministic path selection (tie-break rule)

Documented in `convert.ts` and enforced by tests:

1. **Fewest hops** (shortest path by edge count).
2. **Lowest total** accumulated `uncertaintyPct`.
3. **Lexicographically smallest** path signature: edge keys joined by `" | "`.

Cycles cannot hang: a best-cost table per form id only re-expands on a strictly better `(hops, uncertainty, pathKey)` arrival.

Outgoing edges are sorted by key before expansion so queue order is independent of input array order for equal-cost ties.

---

## Unit factor table (with sources)

| Unit | Dimension | → base | Source / definition |
|---|---|---:|---|
| g | mass | 1 | SI base |
| kg | mass | 1000 | SI |
| mg | mass | 0.001 | SI |
| lb | mass | **453.59237** | International yard and pound agreement (1959): 1 lb = 0.45359237 kg |
| oz | mass | **28.349523125** | 1/16 lb |
| ml | volume | 1 | SI base |
| l | volume | 1000 | SI |
| gallon | volume | **3785.411784** | US gallon = 231 in³ (exact) |
| quart | volume | 946.352946 | 1/4 gal |
| pint | volume | 473.176473 | 1/8 gal |
| cup | volume | **236.5882365** | 1/16 gal (US legal cup; brief cites 236.588 — full precision retained) |
| fl oz | volume | 29.5735295625 | 1/128 gal |
| tbsp | volume | 14.78676478125 | 1/2 fl oz; **1 tbsp = 3 tsp** exactly |
| tsp | volume | 4.92892159375 | 1/6 fl oz |
| each | count | 1 | base |
| dozen | count | 12 | identity |

US customary only — **not** metric cup (250 ml) or Imperial pint. Constants also exported as `EXACT.*` for tests and seed tooling.

---

## `parseQuantity`

### Handles

- Mixed numbers: `1 1/2 cups`
- ASCII fractions: `3/4 cup`
- Unicode vulgar fractions: `½`, `¼`, `¾`, `⅓`, `⅛`, …
- Decimals: `1.5 cups`
- Multi-word units: `8 fl oz`
- Ranges: `2-3 cloves` → midpoint **2.5**, `isRange: true`
- Article + unit: `a cup` → qty 1
- Count aliases: `cloves` → `each`
- Unknown unit tokens: still `kind: 'quantity'` with `unitKnown: false` (caller/matcher decides)

### Non-quantified (deliberate — **not** zero)

Distinct result `{ kind: 'non-quantified', phrase }`:

`pinch`, `dash`, `to taste` / `tt`, `as needed`, `as desired`, `for garnish`, `for serving`, `optional`, `handful`, `smidgen`, and trailing forms like `salt to taste`.

### Deliberately rejects / unparsed

- Empty string
- No leading quantity and not a known non-quantified phrase (`kind: 'unparsed'`)
- Does **not** invent units from free ingredient text alone
- Does not parse complex parentheticals or dual units (`2 cups (250 g)`) — left for a later recipe-line parser

---

## `formatQuantity`

- Input is always **base-unit** qty + dimension.
- Default locale **`us`**: prefers readable customary units (cup before pint so ~473 ml → `2 cups`; mass → `2.5 lb` for ~1134 g).
- `locale: 'metric'` prefers kg/g and l/ml.
- `preferredUnit` forces a known unit of the right dimension.
- **Precision:** `decimalsForUncertainty(display, uncertaintyPct, maxDecimals)` — absolute uncertainty ≈ `|value| * pct/100`; decimal places capped so the last digit is not finer than that uncertainty. High uncertainty never prints false thousandths.

---

## Module layout

```
packages/core/src/units/
  types.ts      Dimension, forms, edges, ConversionResult
  factors.ts    UNIT_DEFS, EXACT, resolveUnitId
  edge-key.ts   Stable edge identity for paths / tie-break
  convert.ts    convert(), convertToBase, convertBaseToUnit
  parse.ts      parseQuantity
  format.ts     formatQuantity, decimalsForUncertainty
  index.ts      barrel (root src/index.ts intentionally untouched)
packages/core/test/units/
  factors.test.ts
  convert.test.ts
  graph.test.ts
  parse.test.ts
  format.test.ts
```

**No new runtime dependencies.** Dev stack unchanged (vitest, typescript).

---

## Test coverage summary

| Requirement | Covered |
|---|---|
| Round-trips per dimension (lossless within EPS) | `factors.test.ts` |
| 1 cup = 236.588… ml; 1 lb = 453.59237 g; 1 tbsp = 3 tsp | `factors.test.ts` |
| Density: 1 cup grated parmesan @ 0.38 g/ml ≈ 90 g (exact math) | `convert.test.ts` |
| Count via gramsPerCount | `convert.test.ts` |
| Unconvertible pairs → `ok: false`, never approximate | `convert.test.ts` (headline) |
| Multi-hop uncertainty > single-hop components | `convert.test.ts` |
| Shortest path preferred over longer | `convert.test.ts` |
| Equal-length + equal unc → lex smallest path; stable | `graph.test.ts` |
| Lower unc wins on hop tie | `graph.test.ts` |
| Cycles terminate; unreachable → no-path | `graph.test.ts` |
| parse: fractions, unicode, decimals, ranges, non-quantified | `parse.test.ts` |
| format: US retail examples + uncertainty precision | `format.test.ts` |

**62 units tests, all green.** M0 `smoke` + `sqlite-proof` (4 tests) still green.

---

## Verification

```
# Units only (this track)
npx vitest run test/units          → 5 files, 62 tests, all pass
npx tsc --noEmit -p packages/core  → zero errors under src/units or test/units

# M0
npx vitest run test/smoke.test.ts test/sqlite-proof.test.ts → 4 pass

# Grep: no react / react-native imports under packages/core/src
```

**Full monorepo `npm run typecheck` / `npm run test` currently fail** solely due to incomplete parallel `packages/core/src/pantry/**` (missing exports like `sortAndDedupe`, type mismatches in fold/projection). That directory is out of this track’s ownership. Once Track B lands, the workspace scripts should go green without units changes.

---

## Deviations

1. **Cup factor precision:** Brief text says `236.588` ml; implementation stores the exact 1/16 US gallon value `236.5882365` ml and asserts `toBeCloseTo(236.588, 3)`. Prefer exact definition over a rounded citation.
2. **Uncertainty combine rule:** Additive percentages (not RSS). Stated above; easy to swap if product wants statistical independence.
3. **Same-dimension multi-form:** If `fromFormId ≠ toFormId` even when dims match, convert requires a graph path (pack-size / form identity hops). Pure unit conversion is used when form ids are absent or equal.
4. **Root barrel:** Per brief, did **not** edit `packages/core/src/index.ts`. Consumers import from `packages/core/src/units` (or architect wires the barrel at integration).
5. **Full `npm run test`:** Not all-green workspace-wide because of Track B WIP — units + M0 are green in isolation.

---

## Open questions (do not guess)

1. **Edge factor convention confirmation:** Implemented as `toBase = fromBase * factor` in each form’s own base unit. Should seed data instead store “1 from-display-unit = N to-display-unit” with unit fields on the edge?
2. **Bidirectional edges:** Only directed edges are walked. Should seed always emit reverse edges, or should `convert` auto-invert (`1/factor`) when `source` allows?
3. **Volume↔count via mass:** Single-form path chains density + gramsPerCount (uncertainty counted twice). Acceptable, or require an explicit edge?
4. **Range handling policy:** Midpoint + `isRange` flag — should cook planning treat ranges as the **high** end (safer shortfall) instead?
5. **Display of non-quantified:** UI copy for `phrase` keys (`to-taste`, `pinch`) — any required user-facing strings in core, or UI-only?
6. **Imperial / UK units:** Explicitly out of scope; confirm we never accept Imperial pint/cup aliases.
7. **Uncertainty display:** format strips precision but does not append `±` or `~`. Should format include a confidence marker, or is that purely a provenance UI concern?

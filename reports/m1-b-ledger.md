# M1 Track B — Pantry ledger, projection, par levels

**Candidate implementation report** · 2026-07-25  
**Scope:** `packages/core/src/pantry/**`, `packages/core/test/pantry/**`  
**Verification:** `npm run typecheck -w @larder/core` (clean) · `npm run test -w @larder/core` (**110 passed**, including M0 + track A units)

---

## Total-order and conflict-resolution rules

### Total order

Transactions for one household ingredient are ordered by the triple:

```
(occurredAt, deviceId, clientTxnId)   // lexicographic on each field
```

**Why this is total (no ties for distinct logical events):**

- DB invariant: `UNIQUE(household_id, client_txn_id)`.
- Distinct accepted events therefore differ in at least `clientTxnId`.
- When all three fields compare equal, the events are the same logical write; de-dupe collapses them before fold.

Cursor encoding: `` `${occurredAt}\x1f${deviceId}\x1f${clientTxnId}` `` (U+001F unit separator).

`acceptedAt` (server clock) is stored for diagnostics / future experiments but is **not** part of the fold order (matches SPEC). Client clock skew can mis-order relative to wall time; that is a known open item.

### Fold semantics

1. De-dupe by `clientTxnId` (idempotent replay).
2. Total-order sort.
3. Quantity fold starts at the **last absolute** (checkpoint); relatives before it cannot affect `qtyBase`.
4. `relative` → `acc += deltaBase`; `absolute` → `acc = targetBase`.
5. **Never clamps** negatives — `isNegative` signals the UI to prompt *"still have some?"*.

### Concurrent absolutes

- Winner = last absolute in total order.
- Losers = prior absolutes that the winner **did not observe**:
  - `basisCursor` missing/empty, or
  - `basisCursor` sorts strictly before the loser's cursor.
- Both events are retained in the log; fold sets `conflict: true` + `conflictDetail` so the UI surfaces once.
- Intentional supersession (later recount with `basisCursor` ≥ prior absolute's cursor) is **not** a conflict.

### Named regression (flour)

Start 1000 g; offline A recounts → 500; offline B recounts → 800 (same basis).  
Union-of-deltas would yield **300**. Fold yields **800** (B later), `conflict: true`.

---

## Provenance thresholds

| Band | Rule | UI intent |
|---|---|---|
| **verified** | `lastVerifiedAt` set, `unverifiedCookCount === 0`, age ≤ **30 days** | `✓ receipt · 2 days ago` |
| **drifting** | 1–**4** unverified cooks, or age (30d, 90d] with 0 cooks | `⚠ 3 cooks since last verified` |
| **stale** | never verified, **>4** cooks, or age **>90 days** | `⚠ estimated · never verified` |

**Why these numbers:**

- Purchase and recount are verifying events; they reset the cook counter.
- Consumption reasons that increment: `cook`, `quick`, `waste` (not `adjust_delta`).
- 30d verified window: age alone soft-degrades so forgotten items do not look fresh forever; any cook immediately leaves verified.
- Drifting up to 4 cooks matches the flour example as still anchored, not yet noise.
- 5+ cooks or 90d: refuse false precision.

Constants: `VERIFIED_MAX_AGE_MS`, `STALE_AGE_MS`, `DRIFTING_MAX_COOKS` in `provenance.ts`.

---

## Par-level formula and seasonal guard

### Priority

1. **User override** (`userOverrideBase > 0`) → `source: 'override'`
2. **Learned** after ≥3 purchases in the seasonal-filtered set:
   ```
   parLevelBase = medianPurchaseQty * clamp(coverageDays / medianDaysBetween, 1, 4)
   ```
   where `coverageDays = 7` (staple) or `14` (default). When cadence is unknown or
   slower than coverage, factor clamps to 1 (par ≈ one typical purchase unit).
   Frequent buyers (milk every 3d) get a higher multi-unit par so the LOW band
   tracks restock cadence, not a single bottle's 25%.
3. **Package seed** (`PackageSeed.netBase`) → `source: 'seed'`
4. Else largest seen purchase / 0 → `source: 'default'`

### Seasonal guard

`SEASONAL_GAP_MS = 120 days (~4 months)`.

Sort purchases by time; keep the **most recent contiguous run** where consecutive gaps ≤ 120 days. Purchases isolated by a larger gap are dropped from learning.

**Effect:** annual Thanksgiving turkey (gap ≫ 120d) leaves a run of length 1 → cannot learn (need 3) → fall back to package seed. Turkey does not read LOW in March from a November weight.

### Low threshold (cadence)

Cadence also moves the LOW *ratio* independently of par:

| Condition | `lowThresholdPct` |
|---|---|
| Default | 0.25 |
| Staple (no extreme cadence) | 0.35 |
| Bulk cadence median days ≥ 60 | ≥ 0.40 (alert earlier — 25 lb rice not first heard at ~6 lb) |
| Frequent cadence median days ≤ 5 | ≤ 0.20 (milk every 3 days must not read LOW constantly) |
| Explicit override | caller wins |

`OUT` at `qty <= epsilon` (1e-9).  
`LOW` at `qty/par <= threshold` and not out.  
`NEGATIVE` at `qty < 0` — distinct status, never clamped.

**Batched only:** `evaluateStockBatch` returns `{ out, low, negative, brief }` for one daily shopping brief — no per-item push API.

---

## Re-fold bounding strategy

- `PantryItem.qtyBase` is a **cache**. Incremental `qty += delta` in **arrival** order is wrong under out-of-order sync (named bug).
- `needsRefold(watermark, incoming)` is **true** when:
  - incoming is **absolute**, or
  - incoming cursor **≤ watermark** (out-of-order / equal).
- Strictly-newer relative → safe incremental path.
- On re-fold, `foldLedger` (bounded by default) walks only from the **last absolute** forward.
  - `txnsConsidered` / `txnsSkipped` prove the bound in tests (e.g. 20 pre-checkpoint txns skipped, 2 considered).
- Conflict detection still inspects **all** absolutes in the prepared log (so concurrent recounts before the winning checkpoint are not missed).

Invariant (tested): after any merge sequence, `projection.qtyBase === fold(log).qtyBase`.

---

## Test coverage

| Area | Coverage |
|---|---|
| Flour 1000/500/800 | Named regression; winner + conflict; not 300 |
| Relative-only fold = sum | Property test, seeded Mulberry32, 40 shuffles |
| Arrival-order invariance | Property test mixed abs/rel, 40 permutations |
| Duplicate `clientTxnId` | Idempotent under fold + shuffle |
| Absolute checkpoint | Pre-absolute history discarded; relatives after apply |
| `needsRefold` | Absolute, out-of-order, strictly-newer relative, null watermark |
| Bounded walk-back | `txnsConsidered` / `txnsSkipped` / `logSliceForRefold` |
| Par | Cold start, seasonal turkey, bulk, alternating packages, frequent milk |
| Stock | Zero, epsilon, threshold boundary, negative, batch brief |
| Provenance | Cook increment, purchase/recount reset, age bands, stale |

Seeded PRNG only — no bare `Math.random()` in property tests.

---

## Seam note (track A units)

**Do not import from `src/units/`** (written in parallel). Local structural types:

```ts
type Dimension = 'mass' | 'volume' | 'count';
type QtyBase = { qtyBase: number; dim: Dimension };
```

Architect wires root barrel and unifies with track A at integration. This track does **not** edit `packages/core/src/index.ts`.

---

## Deviations and reasoning

1. **Conflict detection vs quantity slice:** Quantity fold is bounded at last absolute; conflict scan uses the full absolute set so concurrent losers are still reported.
2. **Frequent cadence lowers staples too:** Spec wants milk not constantly LOW; threshold 0.20 on ≤5d cadence applies even when `isStaple`.
3. **Par uses median *and* a cadence factor (1..4):** SPEC says par is a function of median quantity *and* time-between-purchases. Alternating packages stay stable because the median of qty is taken first; the factor only scales by restock cadence, not package size.
4. **No new runtime deps.**

---

## Open questions (stated plainly, not guessed)

1. **Device clock skew:** fold still orders by client `occurredAt`. Should production eventually prefer `acceptedAt` (or hybrid) for household multi-device? SPEC leaves this open.
2. **Who may recount / roles:** authority for absolute writes not in this track.
3. **Seasonal taxonomy:** `seasonalTag` is a caller flag; no ingredient category table in this track.
4. **Epsilon in physical units:** 1e-9 base units is fine for g/ml math; product may want a display-aware epsilon later.
5. **Conflict UI retention:** when to clear `conflict` after user acknowledges — projection stores a boolean; UI/sync policy TBD.
6. **Form dimension:** projection carries `dim` but does not validate form conversion (track A).

---

## Files

### Created / owned

```
packages/core/src/pantry/types.ts
packages/core/src/pantry/order.ts
packages/core/src/pantry/fold.ts
packages/core/src/pantry/projection.ts
packages/core/src/pantry/provenance.ts
packages/core/src/pantry/par.ts
packages/core/src/pantry/stock.ts
packages/core/src/pantry/index.ts
packages/core/test/pantry/helpers.ts
packages/core/test/pantry/fold.test.ts
packages/core/test/pantry/property.test.ts
packages/core/test/pantry/projection.test.ts
packages/core/test/pantry/provenance.test.ts
packages/core/test/pantry/par.test.ts
packages/core/test/pantry/stock.test.ts
reports/m1-b-ledger.md
```

### Not touched

- `packages/core/src/index.ts` (root barrel — other track)
- `packages/core/src/units/**`, `src/seed/**`, `apps/**`

---

## Verification results

```
npm run typecheck -w @larder/core   → exit 0
npm run test -w @larder/core        → 13 files, 110 tests passed
```

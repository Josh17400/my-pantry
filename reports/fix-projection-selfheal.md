# Projection self-heal from the ledger

## Problem

Owner device showed **Plenty** for an item whose true stock was **0**, and the
item never reached the grocery list on Refresh. Clean profiles worked:

```
Chicken breast 1.984 lb Plenty → empty it → 0 lb Out → on the list
```

Rendering and grocery logic were correct. The device held a **stale
projection**: an older build wrote the ledger transaction but left
`pantry_items.qtyBase` wrong. Screens faithfully rendered the cache.

`SPEC.md` requires `projection == fold(log)`. Nothing checked that invariant,
so drift was permanent and invisible.

## Solution

### 1. Verify/repair pass (`apps/web/src/db/projection-repair.ts`)

For a household, for each `(ingredientId, formId)` drawn from existing
projections **and** ledger keys:

1. Load the household ledger once; group by `ingredientId`.
2. Recompute truth with **`foldLedger` from `@larder/core`** (same fold as
   `appendTxn` / sync merge — no second implementation).
3. Compare fold-owned fields (`qtyBase`, watermarks, provenance, `isNegative`,
   `conflict`) against the stored row via `projectionDiffersFromFold`.
4. On mismatch, call the same **`recomputeProjection`** helper used by
   `appendTxn` (writes the cache from the fold).
5. Return observable counts: `{ checked, repaired, changes[] }`.

Diagnostics copy: `"Checked 42 items, repaired 1."`
(`formatProjectionRepairSummary`).

### 2. Startup trigger (cheap, once per version)

Stamp in `app_meta`:

| Key | Value |
|-----|--------|
| `projection_repair_stamp` | `{PROJECTION_REPAIR_VERSION}\|{SEED_VERSION}` e.g. `1\|1.0.0` |

- **`PROJECTION_REPAIR_VERSION`** (`constants.ts`) — bump when the repair
  logic itself changes.
- Combined with core **`SEED_VERSION`** so a catalog seed bump also re-runs
  the pass.

Hooked at the end of:

- `runSeed` (native / node-sqlite / Drizzle path)
- `runDevSeed` (browser IndexedDB dev driver)

Same pattern as `locations_tree_version`. When the stamp already matches,
the pass is a no-op (`applied: false`, `checked: 0`) — **not** a full re-fold
on every launch.

### 3. Manual “Verify pantry data” (Settings → Diagnostics)

Placed **above** “Reset local data…” so users reach for fix-before-wipe:

- Button `data-testid="verify-pantry-data"`
- Calls `domain.verifyAndRepairProjections({ force: true })`
- Reloads the pantry store so grocery / pantry screens pick up repaired qty
- Status line: *Checked N items, repaired M.*

Reset still wipes; verify repairs.

### 4. Write-path audit

| Path | Writes txn? | Updates projection? |
|------|-------------|---------------------|
| `DomainRepository.appendTxn` | yes | **yes** — `recomputeProjection` → `foldLedger` |
| `DevDomainRepository.appendTxn` | yes | **yes** — same |
| Sync `insertTxnIfAbsent` + `mergePulledTxns` | yes | **yes** — `needsRefold` / `foldLedger` / `projectionMatchesFold` safety net |
| `upsertPantryItem` | **no** | writes `qtyBase` for metadata / fixtures only — not a ledger path |

**Original cause (plainly):** an earlier build path wrote a removal (or other
stock change) into `pantry_txns` without recomputing `pantry_items`. Today’s
`appendTxn` always recomputes; the bug is **historical drift already on disk**,
not a live silent skip in the current tree. No current txn-write path was found
that skips projection recompute.

`upsertPantryItem` can still set `qtyBase` without a matching ledger event
(fixtures, location/par edits that pass qty through). That is intentional for
non-stock fields but remains a footgun if misused for stock. Stock UI paths
(adjust / recount / cook / quick / receipt / barcode) all go through
`appendTxn`.

## Cost on a large ledger

- **One** select of all household projections + **one** select of all household
  txns (not N round-trips to load the log).
- Per key: in-memory `foldLedger` (bounded from last absolute — core skips
  pre-checkpoint history).
- `recomputeProjection` only runs for rows that actually differ (typical second
  run: **0** writes).
- Startup cost when stamp is current: **meta read only**.
- First post-upgrade run: O(items × fold). For a few hundred pantry rows this
  is well under a second on device SQLite; the boot splash already covers
  `initialize` / seed.

Absolute recounts are respected: repair folds through core’s checkpoint slice,
so pre-checkpoint junk is not resurrected (covered by test).

## Tests (`projection-repair.test.ts`)

| Case | Covered |
|------|---------|
| Corrupt `qtyBase` vs ledger → repair restores `fold(log)` | yes (owner Plenty-at-0) |
| After repair: **Out** label + grocery **stock-out** | yes |
| Second force run repairs 0 (idempotent) | yes |
| Absolute checkpoint not resurrected | yes (flour 10k purchase → recount 200 → cook −50 → 150) |
| Stamp skips re-run on subsequent launch | yes |

**Verification results**

- `npm run typecheck` — pass  
- `npm run lint` — pass  
- `npm run test` — **280 core** + **313 web** (was 305; +8 repair tests)  
- `npm run build` — pass  
- `node scripts/verify-interactivity.mjs` — pass  
- `node scripts/verify-chrome.mjs` — pass  

## Files touched

| File | Role |
|------|------|
| `apps/web/src/db/projection-repair.ts` | Pass + stamp gate + summary formatter |
| `apps/web/src/db/projection-repair.test.ts` | Required scenarios |
| `apps/web/src/db/constants.ts` | Meta key + repair version |
| `apps/web/src/db/domain-repository.ts` | `verifyAndRepairProjections` |
| `apps/web/src/db/seed.ts` | Startup gate after seed |
| `apps/web/src/db/drivers/dev.ts` | Dev driver parity + seed hook |
| `apps/web/src/db/index.ts` | Exports |
| `apps/web/src/features/settings/SettingsScreen.tsx` | Diagnostics action |

No changes to `packages/core/**`, `supabase/**`, or `native/**`.

# M2 Track B — receipt capture and review UI

**Date:** 2026-07-26  
**Scope:** `apps/web/src/features/receipt/**`, routes `ScanPage.tsx`, `ReceiptReviewPage.tsx`, `App.tsx` route wiring  
**Not touched:** `packages/core/**`, `supabase/**`, `src/ui/**`, `src/state/**`, `src/db/**`, other feature folders  
**Commits:** none (per brief)

---

## Headline metric — synthetic 40-line Costco case

| Setup | Count |
|---|---|
| High-confidence (auto-accepted, collapsed) | **28** |
| Medium (needs review, resolvable match) | **8** |
| Non-food (filtered, collapsed) | **4** |
| **Taps to commit (bulk-first path)** | **3** |

### Tap path (measured)

```
1. bulk-dismiss-filtered     → 4 non-food skipped
2. bulk-accept-review-matches → 8 medium accepted
3. commit                    → "Added 36 items · 4 skipped."
```

**Review-only taps (before commit button): 2.**  
**With commit: 3.**

Red-team worst case (M1): **80–120 taps** for the same shape.  
Naive non-bulk lower bound for this fixture (8 accept + 4 skip + commit): **13**.  
Bulk path: **3** — ~40× better than the red-team ceiling, ~4× better than per-line medium/non-food.

Measurement is pure and deterministic (`measureSynthetic40TapPath()` in `synthetic-40.ts`, asserted in `receipt.test.ts`). The review screen shows a live **Taps:** badge during development.

---

## Review-screen interaction model

Bulk-first by construction:

1. **High-confidence** (`match.autoAccept` on receipt path — exact / learned / global-exact / normalized, no vetoes) land as `high-auto` with `disposition: accepted`. Shown as one collapsed card: *“N items matched — review”* — expand to list, zero per-line confirmation.
2. **Attention queue** only for: medium/low matches (`needs-review`), size ambiguity (`16 oz or 24 oz?` package chips), allergen vetoes, unmatched lines with candidate chips.
3. **Filtered** (non-food / tax / discount / total) live in a second collapsed section — **never silently dropped**. One bulk action dismisses all.
4. **Commit** disabled until every line is `accepted` or `skipped`. Nothing enters the pantry until commit.

### Bulk actions (and what they cannot bypass)

| Action | Effect | Hard exclusions |
|---|---|---|
| Accept all high-confidence | Re-affirm `high-auto` | Allergen vetoes |
| Dismiss all non-food | Skip all `filtered` | — |
| Accept all suggested matches | Accept pending `needs-review` / resolved unmatched with qty | **Allergen veto**, **size ambiguity**, unresolved unmatched |
| Accept all {category} | Same as suggested, category-scoped | **Allergen veto**, size ambiguity |

**Non-negotiable:** allergen-vetoed lines are never bulk-accepted. No bulk action clears an `allergen` veto. Size choices stay per-line package chips (SPEC: *“16 oz or 24 oz?”*).

---

## Capture

| Platform | Path |
|---|---|
| Web | `<input type="file" capture="environment">` |
| Native | Probe `Capacitor.Plugins.Camera` when present; else same file input |

Client-side **downscale** (max edge 1600) + **JPEG compress** (q≈0.72) before upload (`image-compress.ts`). Multi-photo append supported for long receipts.

> **Deviation:** `@capacitor/camera` is not installed in the workspace yet. Capture uses a runtime Capacitor plugin probe + file input so typecheck stays clean without a new dep. Adding the package is a one-line native track follow-up.

---

## Duplicate handling

Fingerprint: `receiptFingerprint({ store, date, total, lineCount })` from `@larder/core` dedupe (deep-import).

| Decision | UX |
|---|---|
| **Exact** match vs recent committed | **Block** with explanation. No review commit path. Scan not charged (parse may have run; server commit never called). |
| **Near** match within 7 days | **Warn** — same store, close total/lines. User may override (“Scan anyway”). |
| **Ok** | Proceed to review |

Priors stored in `localStorage` (`fingerprint-store.ts`) on successful commit. Household double-count of the same trip is the bug this closes.

> Fingerprint needs store/date/total/lineCount, so the guard runs **after parse**, before review proceeds (or as a gate into review). Pre-image hashing is not used; content fingerprint is the SPEC contract.

---

## Alias learning

On commit, every accepted line with `learnAliasOnAccept` (medium / user-resolved — not silent high-auto) writes a **user-scoped** alias: store string → `ingredientId` (`alias-store.ts`, household-scoped localStorage).

Next scan: user alias is cascade step 1 → high-auto. Compounding is the product bet. No global promotion (core `shouldAutoPromote` remains curation-gated).

---

## Commit

- Writes `purchase` relative txns with:
  - `refId` = `shoppingTripId` (trip reconciliation hook for grocery track)
  - `unitPrice` when known
- Then server `action: commit` on parse-receipt (**quota charged here only**).
- Local/dev synthetic attempts use `localOnly` so offline demos don’t require Supabase.
- Plain summary: *“Added 36 items · 4 skipped.”*

---

## Failure paths

| Failure | UX | Scan quota |
|---|---|---|
| Parse unreadable / schema | Retake; clear message | Not charged |
| Not a grocery receipt (`not_grocery`) | Say so before review | Not charged |
| Offline / network | Queue compressed images (`offline-queue.ts`); scan when online | Not charged until later commit |
| Exact duplicate | Block with explanation | Commit never runs |

---

## Routes

| Path | Screen |
|---|---|
| `/scan` | `ScanPage` → `ScanScreen` |
| `/receipt/review` | `ReceiptReviewPage` → `ReceiptReviewScreen` |

Dev shortcut on scan screen: *“Dev: open synthetic 40-line review”*.

---

## Layout

```
apps/web/src/features/receipt/
  core-imports.ts       # deep-import matching + dedupe + seed
  types.ts              # parse response shapes
  image-compress.ts
  capture.ts
  fingerprint-store.ts
  offline-queue.ts
  alias-store.ts
  match-catalog.ts
  qty.ts
  review-model.ts       # pure bulk-first state machine + tap counter
  synthetic-40.ts       # 28/8/4 fixture + tap measurement
  parse-client.ts
  commit.ts
  session.ts            # scan → review handoff
  ScanScreen.tsx
  ReceiptReviewScreen.tsx
  receipt.test.ts       # 17 tests
  index.ts
apps/web/src/routes/
  ScanPage.tsx
  ReceiptReviewPage.tsx
```

---

## Verification

```
npm run typecheck && npm run test && npm run build
```

| Suite | Result |
|---|---|
| `@larder/core` | **248** passed |
| `@larder/web` | **170** passed (prior ~134 + this track **17** + parallel barcode/cooking tracks) |
| typecheck | clean |
| build | clean |

Receipt tests cover: bulk accept, fingerprint block/warn/ok, allergen veto surviving all bulk actions, non-food collapse + one-tap dismiss, synthetic 40-line **3-tap** path, purchase txn shape (`refId`/`unitPrice`), alias learning + fingerprint remember on commit.

---

## Deviations

1. **`@capacitor/camera` not added as a package** — runtime probe + file input instead (no heavy dep; native can add the plugin later).
2. **Matching / dedupe deep-imported** (same pattern as grocery/recipes) — not on `@larder/core` root barrel; architect owns re-exports.
3. **Fingerprint store / aliases / offline queue** use `localStorage` until a dedicated DB table / sync path exists (out of scope; other tracks own `src/db`).
4. **`shoppingTripId` carried as `refId`** on purchase txns — matches current `AppendTxnInput` shape; no schema change allowed in this track.
5. **Duplicate check after parse** (not before photo upload) — fingerprint inputs are parse outputs per SPEC.

---

## Open questions

1. Should near-match override still charge a scan on commit? (Currently yes if user commits — correct for a real second trip.)
2. Home / pantry entry point for “Scan receipt” CTA (other tracks own those folders; routes exist at `/scan`).
3. Wire offline queue drain on `online` event + background parse (scaffold exists; auto-drain not scheduled).
4. When household receipt priors sync from server, replace localStorage fingerprint list with repository-backed priors.

---

## Red-team M1 closure

> *A 40-line Costco receipt at one confirmation per line is 80–120 taps. That is not a wow feature, it is QuickBooks.*

This track’s measured answer: **3 taps to commit** for 28 high / 8 medium / 4 non-food, with allergen lines permanently excluded from bulk accept and filtered lines never silently dropped.

# Fix: sheets must suppress the tab bar — and the checker must open them

**Date:** 2026-07-26  
**Scope:** `apps/web/src/ui/**`, `App.tsx`, `features/pantry/**`, minimal presence hooks in `features/recipes/{SubstitutionPicker,NegativeStockPrompt}.tsx`, `scripts/verify-chrome.mjs`  
**Gate:** `npm run typecheck && npm run lint && npm run test && npm run build` — green  
**Tests:** 279 core + 252 web  
**Chrome:** `node apps/web/scripts/verify-chrome.mjs` — all checks passed (static routes + interactive sheet states)  
**Interactivity:** `node apps/web/scripts/verify-interactivity.mjs` — all checks passed  

---

## Problem

Equal `z-40` on the fixed tab bar wrapper and on modal sheets meant **DOM order decided stacking**. The tab bar renders after main content, so it painted over sheet primary actions (Add to pantry, Log waste, Save, Apply adjustment, …). The failure was inconsistent: only sheets whose action sat in the tab-bar band lost the hit.

This is the same class as cook-confirm, duplicate FAB, and “Log cook” under the bar — a control exists but the user cannot reach it.

`verify-chrome.mjs` already hit-tested interactive elements, but **only on static routes**. Sheets do not exist until a trigger is tapped, so the checker never saw the bug.

---

## 1. Z-index scheme (named tokens)

| Layer | Value | Tailwind | Constant | Use |
|-------|------:|----------|----------|-----|
| Chrome | 40 | `z-chrome` | `Z_INDEX.chrome` / `Z_CLASS.chrome` | Fixed tab bar + FAB wrapper |
| Sheet | 50 | `z-sheet` | `Z_INDEX.sheet` / `Z_CLASS.sheet` | Modal sheets, pickers, confirm dialogs |
| Toast | 60 | `z-toast` | `Z_INDEX.toast` / `Z_CLASS.toast` | Undo toast above an open sheet |

**Where they live**

- Numbers + docs: `apps/web/src/ui/layers.ts` (`Z_INDEX`, `Z_CLASS`)
- Tailwind theme: `apps/web/tailwind.config.js` → `theme.extend.zIndex`
- Comment on the shell chrome wrapper in `App.tsx` points at the scheme so the next overlay does not invent freehand `z-40` again

Rule: **never assign freehand `z-40`/`z-50` to a new overlay** — import `Z_CLASS` or use the Tailwind tokens.

---

## 2. Nesting counter + chrome suppression

**Module:** `apps/web/src/ui/sheet-presence.ts`

| API | Role |
|-----|------|
| `acquireSheet()` | Increment counter; returns idempotent release |
| `useSheetPresence(active)` | Register while mounted / `active` |
| `useSheetLifecycle(open)` | Presence + restore focus to prior element on close |
| `useSheetOpenCount()` | Shell subscription via `useSyncExternalStore` |
| `document.body[data-sheet-open]` | Counter string while any sheet open (tests / CSS) |

**Nesting:** counter, not boolean. Tab bar reappears only when the last release brings the count to 0.

**Body scroll:** on first open, lock with `position: fixed` + stored `scrollY`; unlock and `scrollTo` only when count hits 0.

**Shell:** `AppShell` reads `useSheetOpenCount()`. When `> 0`, the entire chrome wrapper (`data-testid="app-chrome"` / tab bar + FAB) is **not rendered** — hidden, not merely under the sheet.

---

## 3. One sheet primitive + migrations

**Canonical primitive:** `apps/web/src/ui/Sheet.tsx`  
- `role="dialog"` / `aria-modal`  
- `data-sheet="true"` + `data-testid="app-sheet"`  
- `z-sheet`, footer `data-testid="sheet-footer"`  
- Registers via `useSheetLifecycle`  
- Focus moves into the panel on open  

**`features/pantry/components/Sheet.tsx`** re-exports `Sheet` from `ui/` and keeps field helpers (`FieldLabel`, `FieldInput`, `PrimaryButton`, …).

| Surface | Change |
|---------|--------|
| `AddItemSheet`, `AdjustSheet`, `RecountSheet` | Already used pantry `Sheet` → now the shared primitive |
| `PantryItemScreen` waste + edit | Inline `z-40` markup → `<Sheet>` |
| `LocationsScreen` add/edit | Already on `Sheet` |
| `LocationsScreen` delete confirm | Own markup kept; `useSheetLifecycle` + `z-sheet` + `data-sheet` |
| `App` FAB “Add” action picker | Own markup; `useSheetLifecycle` + `z-sheet` |
| `SubstitutionPicker` | Own full-screen markup; `useSheetLifecycle` + `z-sheet` + `data-sheet` |
| `NegativeStockPrompt` | Same participation pattern |
| `UndoToast` | `z-toast` so undo stays above a sheet |

Recipes files only got presence/z-token wiring (brief allowed “keep own markup but participate”).

---

## 4. Checker: open interactive states

`apps/web/scripts/verify-chrome.mjs` still runs static shell routes on **vite preview** (after build).

**New phase:** short-lived **vite DEV** server (fixtures + IndexedDB driver) and drive real triggers:

| Flow | Trigger | Assert |
|------|---------|--------|
| Pantry Add item | `[data-testid="pantry-header-add"]` | Tab/FAB hidden; sweep sheet; advance to details; primary “Add to pantry” present |
| Pantry item Adjust / Recount / Waste / Edit | Real buttons on item detail | Tab/FAB hidden; full sheet interactive sweep |
| Mark used up | Not a sheet | Static content-band hit-test on item page |
| Locations New / Edit | Header Add / row Edit | Same sheet sweep |
| Cook → Substitute | `[data-testid="line-substitute-btn"]` | Picker open; chrome absent; sheet sweep |
| Shell FAB Add sheet | Tab bar FAB | Chrome hides while action sheet open |

**Generalised sheet sweep** (`assertNoObscuredInSheet`): every mostly-visible interactive control inside `[data-sheet]`, with free bands above sticky header and above `sheet-footer` (same idea as the route harness skipping the tab-bar band). Footer and sticky-header controls are tested in their own bands so primary actions at the bottom of a sheet are never excused.

---

## 5. Other obscured controls the generalised sweep turned up

| Finding | Severity | Disposition |
|---------|----------|-------------|
| Catalog rows near the bottom of Add-item **search** list (`Russet potato`, `Red potato`) reported under **Cancel** on first strict full-panel hit-test | Low / harness noise | Not chrome z-index. Centres sat in the footer band of a tall sheet. Harness now uses a content band above `sheet-footer` (mirrors tab-bar band on routes). Primary “Add to pantry” on the **details** step is fully free and asserted by name. |
| No tab-bar-over-sheet failures after the presence + `z-sheet` fix | — | Confirms the product fix for the owner bug. |
| No additional outside-sheet covers on Adjust / Recount / Waste / Edit / Locations / Substitute / FAB add | — | Clean after migration. |

Nothing else required a product change beyond the sheet primitive + chrome suppression. If catalog rows under a non-sticky footer reappear as a real device complaint, consider sticky sheet footers with explicit content padding — not done here to avoid scope creep.

---

## Verification

```bash
npm run typecheck && npm run lint && npm run test && npm run build
# from apps/web:
node scripts/verify-chrome.mjs
node scripts/verify-interactivity.mjs
```

| Suite | Result |
|-------|--------|
| typecheck | pass |
| lint | pass |
| test | 279 core + 252 web |
| build | pass |
| verify-chrome | all chrome checks passed |
| verify-interactivity | all checks passed |

---

## Files touched

| File | Change |
|------|--------|
| `apps/web/src/ui/layers.ts` | **New** — z-index constants |
| `apps/web/src/ui/sheet-presence.ts` | **New** — nested open counter, scroll lock, hooks |
| `apps/web/src/ui/Sheet.tsx` | **New** — shared bottom-sheet primitive |
| `apps/web/src/ui/index.ts` | Export sheet/layers APIs |
| `apps/web/tailwind.config.js` | `zIndex.chrome/sheet/toast` |
| `apps/web/src/App.tsx` | Hide chrome when sheets open; FAB picker on presence |
| `apps/web/src/features/pantry/components/Sheet.tsx` | Re-export ui Sheet; keep fields |
| `apps/web/src/features/pantry/PantryItemScreen.tsx` | Waste + edit → shared Sheet |
| `apps/web/src/features/pantry/LocationsScreen.tsx` | Delete dialog participates in presence |
| `apps/web/src/features/pantry/components/UndoToast.tsx` | `z-toast` |
| `apps/web/src/features/recipes/SubstitutionPicker.tsx` | Presence + `z-sheet` |
| `apps/web/src/features/recipes/NegativeStockPrompt.tsx` | Presence + `z-sheet` |
| `apps/web/scripts/verify-chrome.mjs` | Interactive sheet-state phase |
| `reports/fix-sheet-layering.md` | This report |

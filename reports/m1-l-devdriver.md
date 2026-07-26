# M1 Track L — Browser IndexedDB dev driver

**Date:** 2026-07-26  
**Goal:** Make every product screen reviewable in a desktop browser without a native device build.

---

## Storage design

| Piece | Choice |
|---|---|
| Engine | Plain TypeScript in-memory snapshot (`DevStore`) |
| Persistence | IndexedDB database `good-pantry-dev`, object store `snapshot`, key `state` |
| Schema | Same product tables as SQLite (locations, ingredients, forms, pantry_items, pantry_txns, recipes, grocery, …) as typed arrays |
| Domain API | `DevDomainRepository` — method surface matches `DomainRepository` |
| Projection | **`foldLedger` from `@larder/core` only** — same call as native `DomainRepository.recomputeProjection` |
| Seed | Core catalog + default locations (same sources as `runSeed`) |
| Fixtures | Track G `buildFixtureItems` + `buildFixtureRecipes` via absolute recount txns + metadata upserts |
| No SQLite / wasm | Confirmed: jeep-sqlite path left untouched (`reports/m1-replatform.md`) |

Bulk seed/fixture writes run inside `store.batch()` so IndexedDB is written **once** at the end (first boot was otherwise unusable).

---

## Driver selection (gating)

Implemented in `create-repository.ts` + `drivers/dev-gate.ts`:

1. **`Capacitor.isNativePlatform()`** → `NativePantryRepository` (unchanged)
2. **Browser + `shouldUseBrowserDevDriver()`** → `DevPantryRepository`
3. Else → `WebPantryRepository` (Supabase stub / production companion)

### What we gated on

| Gate | Purpose |
|---|---|
| `import.meta.env.DEV` | Primary — Vite dev server |
| `hostname === 'localhost' \|\| '127.0.0.1'` | Secondary — local `vite preview` / screenshot walker of production builds |

**Not** activated on real deployed hosts → no fake local DB for end users.  
Dev driver is a separate Vite chunk (`dev-*.js`); native SQLite is also a separate chunk so the browser never evaluates Capacitor SQLite.

---

## Projection parity with native

```
appendTxn → insert ledger row (idempotent on clientTxnId)
         → recomputeProjection
         → foldLedger(txns)   // @larder/core — only fold
         → write pantry_items from fold result
```

Unit tests assert projection qty / provenance / watermark match an independent `foldLedger` of the same log (`apps/web/src/db/drivers/dev.test.ts`).

---

## Seeding and reset

| Event | Behavior |
|---|---|
| First open | migrate (no-op shape) → seed catalog + locations → fixtures (if `loadFixtures: true`) |
| Subsequent open | Load IndexedDB snapshot; seed/fixtures skipped when meta versions match |
| **Reset** | Query param **`?reset`** on open deletes IndexedDB and reseeds. Also exported: `resetDevDatabase()` / `DevPantryRepository.reset()` |

Boot wiring: `main.tsx` `BootGate` calls `createPantryRepository()` → `initialize({ loadFixtures: true })` → `setActiveRepository` (singleton promise so StrictMode does not double-open).

---

## Verification

### Tests

| Suite | Result |
|---|---|
| `packages/core` | **248 passed** |
| `apps/web` | **111 passed** (102 prior + 9 new dev-driver tests) |

### Route walker (`node scripts/screenshot-routes.mjs`)

```
 ok   /                status=200 textLen=1147
 ok   /pantry          status=200 textLen=835
 ok   /locations       status=200 textLen=498
 ok   /recipes         status=200 textLen=291
 ok   /recipes/new     status=200 textLen=206
 ok   /grocery         status=200 textLen=707
 ok   /quick           status=200 textLen=384
 ok   /db-health       status=200 textLen=678
all routes rendered
```

Screenshots: `reports/screens/*.png` — pantry lists items, recipes list recipes, grocery shows a list. No “Pantry unavailable” panel on product routes.

### Cook loop (product thesis)

Path: open **Garlic Butter Pasta** → cook preview → **Confirm cook** → pantry qty drops.

| Step | Result |
|---|---|
| Preview need/have/short | Yes — e.g. spaghetti Need 0.75 lb · Have 0.992 lb · Short 0 lb |
| Confirm | “Cook logged” + `cookEventId` |
| **Spaghetti before** | **0.992 lb** (450 g fixture) |
| **Spaghetti after** | **3.9 oz** (~110 g) |
| Delta | **−340 g** — matches recipe line qty |

---

## Screens that broke once real data appeared (honest)

These were latent UI bugs that only fire when `hasActiveRepository()` is true:

1. **Home (`useHomeScreenData`)** — effect called `recipesStore.get()` which toggles `loading`, re-triggering the effect → infinite loop; page froze (screenshot hung).  
   **Fix:** load details via `getDomainRepository().getRecipe()`; drop `loading` from deps.

2. **Recipes / Recipe detail / Cook boot** — `useCallback(..., [pantry])` closed over the whole Zustand store object, so every `load()` recreated the callback and re-ran effects forever.  
   **Fix:** use `useXStore.getState().load()` / `.get()` with stable deps.

3. **Cook “Cook” CTA vs sticky tab bar** — bottom TabBar intercepts pointer events over the detail CTA (layout issue; cook still reachable via `/recipes/:id/cook`).

4. **`/db-health`** — still correctly “Not applicable” on web (native SQLite self-test only). Copy still mentions jeep-sqlite; IndexedDB dev path is separate from that panel.

---

## Files touched

| Path | Role |
|---|---|
| `apps/web/src/db/drivers/dev.ts` | Dev repository + domain + seed/fixtures |
| `apps/web/src/db/drivers/dev-store.ts` | Snapshot + IndexedDB I/O |
| `apps/web/src/db/drivers/dev-gate.ts` | Selection gate |
| `apps/web/src/db/drivers/dev.test.ts` | Tests |
| `apps/web/src/db/create-repository.ts` | Async factory + selection |
| `apps/web/src/db/index.ts` | Exports |
| `apps/web/src/db/fixtures.ts` | Export `buildFixtureRecipes` |
| `apps/web/src/main.tsx` | Boot gate |
| `apps/web/src/routes/DbHealthPage.tsx` | `await createPantryRepository()` |
| `apps/web/src/features/home/useHomeScreenData.ts` | Infinite-loop fix |
| `apps/web/src/routes/RecipesPage.tsx` | Store-deps livelock fix |
| `apps/web/src/routes/RecipeDetailPage.tsx` | same |
| `apps/web/src/routes/CookPage.tsx` | same |
| `apps/web/scripts/verify-devdriver.mjs` | Extra cook-loop harness |

**Not touched:** `packages/core/**`, `drivers/native.ts`, `App.tsx`, UI design system.

---

## Deviations

- Brief said gate only on `import.meta.env.DEV`. Added **localhost** so production-mode local preview (acceptance screenshots) still gets data. Documented above.
- `createPantryRepository` is now **async** (dynamic imports).
- Minimal UI/route fixes outside the original “own” list were required so real data does not freeze the app — reported above.
- `buildFixtureRecipes` exported from fixtures for DRY seeding.

---

## Open questions

1. Should `/db-health` mention the IndexedDB dev driver for browser DEV, or stay strictly “native SQLite only”?
2. Sticky TabBar covering the recipe **Cook** button — product layout fix later?
3. When Supabase companion ships, drop the localhost gate and keep only `import.meta.env.DEV`?
4. Persist-debounce for high-churn mutations beyond seed (currently every domain write awaits IDB put)?

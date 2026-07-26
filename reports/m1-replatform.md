# M1 Re-platform Report — Expo → React + Vite + Capacitor

**Date:** 2026-07-26  
**Scope:** App shell only. `packages/core` untouched.  
**Commits:** none (per brief).

---

## Verification (ran, real output)

| Command | Result |
|---|---|
| `npm run typecheck` | Clean — `@larder/core` + `@larder/web` |
| `npm run test` | **248 passed** (28 files) |
| `npm run build` | Vite production build succeeds (`apps/web/dist`) |
| `npm run dev` | Vite on `http://localhost:5173/` — home + `/db-health` render |
| `git status --short packages/core` | `?? packages/core/` (whole package untracked; **zero modifications** by this work) |
| `apps/mobile/` | **Deleted** |

Playwright smoke of `/db-health` (browser):

- Title: My Pantry  
- `@larder/core · ok · 2 cup → 473.176 ml` (live convert call)  
- Banner: **Not applicable** (no Run button, no fake pass)  
- `crossOriginIsolated: false`, `hasSAB: false`, no COOP/COEP response headers  

---

## Structure built (mirrors euchre-game)

```
Larder/
  packages/core/              UNCHANGED — 248 tests
  apps/web/                   NEW: React 19 + Vite + TS + Tailwind + react-router
    src/db/                   repository + drivers + health-check
    src/routes/               HomePage, DbHealthPage
    src/supabase/             VITE_* env config
    public/assets/sql-wasm.wasm   (present for jeep investigation; unused at runtime)
  native/                     NEW: Capacitor 8.x wrapper (like euchre-game/native)
    capacitor.config.json     appId com.mypantry.app, webDir ../apps/web/dist
    package.json              @capacitor/* 8.4.x, @capacitor-community/sqlite 8.1.0
    ios/                      generated + fastlane (Appfile, Fastfile)
    android/                  generated
  .github/workflows/ios.yml   NEW: manual-only TestFlight workflow
  CI_SETUP.md                 NEW: adapted from euchre-game
  apps/mobile/                DELETED
```

### euchre-game conventions mirrored

| Concern | euchre-game | Larder |
|---|---|---|
| Capacitor root | `native/` | `native/` |
| Config | `native/capacitor.config.json` | same shape |
| Capacitor major | 8.x | 8.x (`@capacitor/core` ^8.4.1) |
| webDir | `www` (built in-place) | `../apps/web/dist` (Vite outDir) |
| iOS workflow | manual `workflow_dispatch`, `macos-26` | same |
| ASC secrets | four API secrets + persistent cert secrets | same (see CI_SETUP) |
| Fastlane | `native/ios/fastlane/{Appfile,Fastfile}` | same layout; bundle id swapped |
| No ads/IAP in shell | euchre has them; we deliberately omit | shell only (M2/M4) |

---

## Stack choices

### Router: **react-router-dom v7** (not TanStack Router)

Shell has two routes (`/`, `/db-health`) and no typed loaders/data routers yet. react-router is the smallest well-known fit. TanStack Router’s type-safe search/loaders can land with product UI (track F) if needed.

### Capacitor + Drizzle wiring

- **Native driver** (`apps/web/src/db/drivers/native.ts`):
  - `@capacitor-community/sqlite` `SQLiteConnection` / `SQLiteDBConnection`
  - **Drizzle via `drizzle-orm/sqlite-proxy`** — async executor callback maps:
    - `method === 'run'` → `conn.run(sql, values)`
    - `method === 'all' | 'values'` → `conn.query(sql, values)` normalized to row arrays
  - Transactions: `beginTransaction` / `commitTransaction` / `rollbackTransaction` around the 1,000-row insert
- **Why sqlite-proxy:** Drizzle has no official Capacitor driver. The proxy dialect is exactly an async SQL callback, which matches Capacitor’s API without inventing a custom dialect.
- **Web driver:** Supabase-direct stub (`NotConfiguredError`) — product decision: web is online companion.
- **Platform switch:** runtime `Capacitor.isNativePlatform()` (replaces Metro `.native.ts` / `.web.ts`).

### Tailwind

Plain Tailwind 3 + PostCSS (NativeWind removed with Expo). Design tokens from `DESIGN.md` remain track F.

---

## jeep-sqlite web finding (highest-value unknown)

### Question

Does `@capacitor-community/sqlite`’s jeep-sqlite wasm path work **without** COOP/COEP (the headers that killed Expo web SQLite)?

### Evidence

1. **Package architecture (installed `jeep-sqlite@2.8.0`)**  
   Dependencies: `sql.js@^1.11.0`, `localforage@^1.10.0`.  
   README: *“based on sql.js for SQLite queries and localforage for database storage in IndexedDB.”*  
   Storage: IndexedDB store `jeepSqliteStore`, not OPFS.

2. **sql.js vs SharedArrayBuffer**  
   Grep of `node_modules/sql.js/dist/sql-wasm.js`: **zero** `SharedArrayBuffer` mentions.  
   (Contrast: official `@sqlite.org/sqlite-wasm` OPFS path *does* require cross-origin isolation.)

3. **Official Web-Usage docs** for capacitor-community/sqlite describe jeep setup with no COOP/COEP steps.

4. **Runtime probe (Playwright, Vite dev, no isolation headers)**  
   ```
   crossOriginIsolated: false
   hasSAB: false
   ```  
   Dev server response headers: **no** `Cross-Origin-Opener-Policy`, **no** `Cross-Origin-Embedder-Policy`.  
   jeep custom element + `initWebStore` still progressed far enough to show a Run UI when experimentally wired.

5. **Vite blocker (not COOP/COEP)**  
   First real DB open/query failed with:
   ```
   LinkError: WebAssembly.instantiate(): Import #34 "a" "I":
   function import requires a callable
   ```  
   Classic sql.js wasm/glue mismatch under a bundler — independent of isolation headers.  
   Tried: pin `sql.js@1.11.0`, copy `sql-wasm.wasm` to `public/assets`, `optimizeDeps.exclude`, `assetsInclude: **/*.wasm`. Still failed.

### Decision

| Claim | Verdict |
|---|---|
| Needs COOP/COEP? | **No** — sql.js + IndexedDB; proven under non-isolated origin |
| Works cleanly as Vite DEV driver? | **No** — wasm LinkError |
| Wire as default browser path? | **No** — product web stays Supabase-direct; honest NA panel |
| Code left behind | `apps/web/src/db/jeep-dev.ts` documents the finding; not imported by the runtime path |

**Never faked a pass.** Production `/db-health` on web shows **Not applicable** only.

---

## Ported from `apps/mobile` vs discarded

### Ported

| Item | Destination |
|---|---|
| `PantryRepository` interface + health types | `apps/web/src/db/repository.ts` |
| Health 7-step runner | `apps/web/src/db/health-check.ts` |
| Drizzle `healthProbe` schema | `apps/web/src/db/schema.ts` |
| Web Supabase stub driver | `apps/web/src/db/drivers/web.ts` |
| Supabase env module | `apps/web/src/supabase/config.ts` (env rename) |
| DB Health UI (native run + web NA) | `apps/web/src/routes/DbHealthPage.tsx` |
| Home workspace health | `apps/web/src/routes/HomePage.tsx` |
| Checksum / batch helpers | still from `@larder/core` |

### Replaced

| Expo path | Capacitor path |
|---|---|
| `expo-sqlite` + `drizzle-orm/expo-sqlite` | `@capacitor-community/sqlite` + `drizzle-orm/sqlite-proxy` |
| Metro `.native.ts` / `.web.ts` | `Capacitor.isNativePlatform()` |
| Expo Router tabs | react-router-dom routes |
| NativeWind | Tailwind CSS |
| `EXPO_PUBLIC_*` | `VITE_*` |

### Discarded (Expo-only shell)

- Entire Expo Router app tree, babel/metro/nativewind configs  
- `expo-*` packages, RN screens/safe-area/worklets  
- Platform color-scheme helpers, Material Symbols font glue  
- `app.json` plugins / COOP header experiments (already removed in M0)  
- `apps/mobile/dist` Expo web export  

---

## `.env` rename

| Old (Expo) | New (Vite) |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `VITE_SUPABASE_URL` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `VITE_SUPABASE_ANON_KEY` |

- Values carried from `apps/mobile/.env` → `apps/web/.env` (never printed, never committed).  
- `apps/web/.env.example` lists empty keys.  
- `.gitignore` keeps `.env` / `.env.*` ignored (with `!.env.example`).

---

## CI workflow + one-time Apple setup

### Workflow (`.github/workflows/ios.yml`)

- **Manual only** (`workflow_dispatch`)  
- `runs-on: macos-26`  
- Steps: root `npm ci` → `npm run build` → `native/` `npm ci` → `npx cap sync ios` → `fastlane ios beta`  
- Secrets (same operational set as euchre-game Fastfile):
  - `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`, `APPLE_TEAM_ID` (the four ASC secrets)
  - `IOS_CERT_P12_B64`, `CERT_EXPORT_PASS` (persistent Distribution cert — required by the mirrored Fastfile; see euchre-game evolution beyond the short CI_SETUP blurb)

### Owner still must do (one-time, needs Apple account)

1. Create App Store Connect API key (App Manager); store four ASC secrets.  
2. Register bundle id **`com.mypantry.app`**.  
3. Create ASC app record with that bundle id.  
4. Mint / reuse team Distribution cert → `IOS_CERT_P12_B64` + `CERT_EXPORT_PASS` (see `CI_SETUP.md`; can reuse euchre cert if **same team**).  
5. First `gh workflow run ios.yml` after secrets exist.  

Full PowerShell commands: **`CI_SETUP.md`** at repo root.

---

## Root scripts

```json
"dev": "npm run dev -w @larder/web",
"build": "npm run build -w @larder/web",
"typecheck": "npm run typecheck --workspaces --if-present",
"test": "npm run test -w @larder/core",
"lint": "npm run lint --workspaces --if-present",
"cap:sync": "npm run build && npm run sync --prefix native"
```

Workspaces: `packages/*`, `apps/*` → `@larder/core`, `@larder/web`.  
`native/` is a **separate** package (own `package-lock.json`), same as euchre-game.

---

## `@larder/core` wiring proof

On Home and DB Health:

```
@larder/core · ok · 2 cup → 473.176 ml
```

via public barrel: `coreHealth()` + `convert({ value: 2, fromUnit: 'cup', toUnit: 'ml' })`.  
**No edits under `packages/core`.**  
(`seedCatalog` is not currently re-exported from the root barrel; convert is the live proof without touching core.)

---

## Unverifiable without Mac / device

| Item | Status |
|---|---|
| Xcode archive / IPA | CI only (`macos-26`) |
| Real device SQLite 7-step pass | Needs iOS/Android WebView on device/simulator |
| TestFlight upload | Needs ASC app record + secrets |
| `cap open ios` | Intentionally not run (no Mac) |
| Android device run | Local Android Studio not part of this brief |

`npx cap add ios` / `cap add android` / `cap sync` **did** succeed on Windows; platforms are generated and sqlite plugin is listed.

---

## Deviations

1. **Fastfile includes cert-import secrets** (`IOS_CERT_P12_B64`, `CERT_EXPORT_PASS`), not only the four ASC secrets — **mirrors current euchre-game Fastfile**, not the older four-secret-only blurb. Documented in `CI_SETUP.md`.  
2. **No AdMob / RevenueCat** packages in `native/package.json` (euchre has them). Explicitly out of scope (M2/M4); do not architect them out forever — just omitted from shell.  
3. **jeep-sqlite not wired as DEV driver** despite no COOP/COEP need — Vite wasm LinkError. Documented; NA panel retained.  
4. **`sql-wasm.wasm` left under `public/assets`** for investigation reproducibility; unused by the default runtime path. Safe to delete later if desired.  
5. **`.gitignore`** no longer blanket-ignores `ios/` / `android/` (would have hidden `native/ios` / `native/android`); now ignores only build artifacts under `native/`.  

---

## Open questions (stated, not guessed)

1. **Bundle id** `com.mypantry.app` — confirm before first ASC registration if a different reverse-DNS is preferred.  
2. **GitHub repo name** for `gh secret set --repo OWNER/REPO` — placeholder in `CI_SETUP.md`.  
3. **Reuse euchre Distribution cert** vs mint a second one for this app (same team → reuse is fine; profiles are per-bundle-id and auto-minted).  
4. **Browser SQLite DEV path** — worth a second pass with a non-Vite host or a different sql.js integration strategy? Product web remains Supabase-direct either way.  
5. **Seed barrel** — `seedCatalog` / ingredient count not on the public `@larder/core` export surface today; product track may want root re-exports later (**outside this shell migration**).  
6. **When product UI lands**, does track F keep react-router or switch to TanStack Router?

---

## Acceptance checklist

- [x] `apps/web` builds and runs (`dev` + `build`)  
- [x] DB Health ported (7 steps on native driver; honest NA on web)  
- [x] `native/` Capacitor 8.x with ios + android; appId `com.mypantry.app`; appName “My Pantry”  
- [x] `.github/workflows/ios.yml` manual-only, mirrored secrets model  
- [x] `CI_SETUP.md` at repo root  
- [x] `apps/mobile/` deleted; root scripts point at new layout  
- [x] `packages/core` imported with a real call (convert + coreHealth)  
- [x] 248 core tests still passing; core tree unmodified  
- [x] jeep-sqlite investigated with evidence; not wired (Vite wasm failure)  
- [x] No git commits  

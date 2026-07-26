# M0 — My Pantry foundation scaffold

**Date:** 2026-07-25  
**Agent:** fresh session (no prior scaffold context)  
**Folder:** `C:\Users\joshu\Documents\Larder` (product name **My Pantry**; folder rename deferred)

---

## Versions pinned (locked from `package-lock.json`)

| Package | Declared | Locked |
|---|---|---|
| Expo SDK | `~57.0.8` | **57.0.8** |
| React Native | `0.86.0` | **0.86.0** |
| React | `19.2.3` | **19.2.3** |
| expo-router | `~57.0.8` | **57.0.8** |
| expo-sqlite | `~57.0.1` | **57.0.1** |
| Drizzle ORM | `^0.45.2` | **0.45.2** |
| NativeWind | `^4.2.6` | **4.2.6** |
| react-native-reanimated | `4.5.0` | **4.5.0** |
| react-native-worklets | `0.10.0` | **0.10.0** |
| better-sqlite3 (core dev) | `^11.10.0` | installed for Node proof |
| TypeScript | `~5.9.2` / `^5.9.2` | 5.9.x |
| Vitest | `^3.2.4` | 3.2.7 |

### NativeWind — does it work?

**Yes for M0 scaffold (web pipeline verified).** Kept NativeWind 4.2.6; did not fall back to StyleSheet-only and did not swap libraries.

- Peers: only `tailwindcss >3.3.0` (satisfied by `^3.4.17`). No Reanimated peer conflict at install against 4.5.0 / worklets 0.10.0.
- `withNativeWind` Metro + `nativewind/babel` + `global.css` + Home `className` styles remain wired.
- `npx expo export --platform web` produced NativeWind CSS (`_expo/static/css/web-*.css`) and SSR HTML for Home/DB Health.
- **Unverified on device:** className → native view style mapping and any Reanimated interop on iOS/Android Expo Go (no Mac / no emulator on this machine).

---

## What was removed (web-sqlite teardown)

| Item | Action |
|---|---|
| COOP/COEP headers in `app.json` (`expo-router` plugin `headers`) | **Removed** |
| Metro `assetExts.push('wasm')` + `.sql` sourceExt for wasm/sql migrations | **Removed** |
| `babel-plugin-inline-import` for `.sql` | **Removed** from babel + package.json |
| Single driver `drivers/expo-sqlite-driver.ts` (native+web wasm, async-read web workaround) | **Deleted** |
| Web async-read comments / path that existed only to dodge Drizzle sync SELECT on wasm | **Gone** with that driver |
| `scripts/m0-web-health.mjs` (Playwright expecting web SQLite ALL PASSED) | **Deleted** |
| Prior `apps/mobile/dist/` including `wa-sqlite*.wasm` and sqlite worker | **Deleted** (rebuild is clean: **0** `.wasm` files, no COOP/COEP in `.routes.json`) |
| Expo template: `EditScreenInfo.tsx`, `ExternalLink.tsx`, `StyledText.tsx`, `Themed.tsx`, SpaceMono font | **Deleted** |
| Product display name "Larder" in `app.json` / Home | **Renamed to My Pantry** (folder still `Larder`) |

### Kept on native merits (not web workarounds)

- **expo-sqlite + Drizzle** native driver (`drivers/native.ts`): uses Drizzle for insert/select/aggregate; `withTransactionAsync` for the 1k-row batch; close/reopen persistence. Async `openDatabaseAsync` is the normal expo-sqlite API, not a web hack.
- **Monorepo Metro** (`watchFolders`, `nodeModulesPaths`, `disableHierarchicalLookup`) — needed for workspaces, independent of sqlite-wasm.
- **NativeWind Metro/babel** — styling track, not web-sqlite.
- **`expo-sqlite` config plugin** — required for native.
- **`constants/Colors.ts` + `useColorScheme` + `useClientOnlyValue`** — still wired by tab layout tint / SSR header visibility.

---

## DB layer structure (as built)

```
apps/mobile/src/db/
  index.ts                     re-exports
  repository.ts                PantryRepository + NotConfiguredError
  schema.ts                    m0_health_probe (Drizzle)
  health-check.ts              7-step runner (native intended)
  create-repository.ts         TS fallback → native
  create-repository.native.ts  expo-sqlite + Drizzle
  create-repository.web.ts     WebPantryRepository
  drivers/native.ts            real offline path
  drivers/web.ts               Supabase-direct stub → NotConfiguredError
```

Metro platform files ensure web does not load `expo-sqlite`.

### DB Health screen

- **Native:** full 7 steps with per-step PASS/FAIL + timings (open → migrate → insert 1000 tx → read/checksum → indexed aggregate → close/reopen persist → drop).
- **Web:** honest panel only:  
  **"Not applicable — web is an online companion, no local database."**  
  No Run button, no fake pass. Verified via `http://localhost:8081/db-health` (SSR contains "Not applicable" + "online companion"; no "ALL PASSED"; no COOP/COEP response headers).

---

## better-sqlite3 proof (`packages/core/test/sqlite-proof.test.ts`)

**Covers (same logic as native health steps):**

1. Open/create file-backed SQLite  
2. Migrate (`HEALTH_PROBE_DDL` matching mobile schema)  
3. Insert 1,000 rows in a transaction (Drizzle + better-sqlite3)  
4. Read back + verify count + `computeChecksum`  
5. Indexed aggregate `COUNT` + `SUM(value)` with elapsed ms  
6. Close, reopen file, re-verify persistence  
7. Drop table; confirm gone  

Shared pure helpers live in `packages/core/src/sqlite-health.ts` (`computeChecksum`, `batchValues`, DDL constants) and are re-exported from `@larder/core` for the app.

**Does NOT cover:**

- **The `expo-sqlite` native binding itself** — never loaded in Node.  
- iOS/Android file paths, OPFS, or Expo Go runtime.  
- Web Supabase driver behavior (stub only).

> **Explicit:** the expo-sqlite binding remains **unverified** on this machine.

---

## Verification results (ran)

| Gate | Result |
|---|---|
| `npm install` (root workspaces) | OK |
| `npm run typecheck` | **zero errors** |
| `npm run test` | **4/4 green** (smoke + sqlite-proof) |
| `npm run lint` | clean (`tsc --noEmit` both workspaces) |
| `npx expo export --platform web` (from `apps/mobile`) | **success** — no wasm in dist |
| `npm run web` | loads; DB Health = honest N/A panel |
| grep `packages/core` for React / react-native imports | **(empty)** |

Note: `npx expo export --platform web` from **repo root** fails (resolves `expo/AppEntry` → missing `App`). Must run from `apps/mobile` or via `npm run export:web -w @larder/mobile`. Root scripts `web` / `start` correctly delegate to the mobile workspace.

---

## Still unverified (and why)

1. **expo-sqlite on a real device / Expo Go** — no Mac, no Xcode, no Android emulator. Binding not exercised.  
2. **Native DB Health 7-step UI on device** — same reason.  
3. **NativeWind className on native views** — web CSS pipeline works; native style application not device-tested.  
4. **`npm run start` QR / Expo Go connect** — server path exists; physical device not used.  
5. **Supabase-direct web driver** — intentional M0 stub (`NotConfiguredError`); no project/credentials.  
6. **Service-worker cache for web** — out of M0 scope.  
7. **Drizzle Kit migration pipeline** — M0 applies probe DDL via `execAsync` / SQL string; no checked-in drizzle migration SQL.  
8. **iOS/Android production builds** — Expo Go constraint only; no custom dev client.

---

## Deviations from brief

| Deviation | Reasoning |
|---|---|
| Kept `constants/Colors.ts` | Still used by tab bar tint; brief said delete if *unused*. |
| Kept `useColorScheme` / `useClientOnlyValue` | Genuinely wired in root + tabs layouts. |
| Deleted `Themed.tsx` (brief said keep if wired) | Only `+not-found` used it; rewritten to plain RN `Text`/`View`. Not otherwise wired. |
| Shared checksum/DDL helpers moved into `@larder/core` | Needed for Node proof without importing app code into core; core stays React-free. |
| DB file renamed `my-pantry-m0.db` (was `larder-m0.db`) | Aligns with product name; M0-only probe file. |
| `slug` / `scheme` → `my-pantry` / `mypantry` | User-facing Expo identity; folder rename still deferred. |
| No root `export:web` script added | Brief listed `npx expo export`; documented cwd requirement instead of expanding scripts surface. |
| `lint` is `tsc --noEmit` (no ESLint) | Matched existing scaffold; brief required clean lint, not introducing ESLint mid-M0. |
| `git init` done; **zero commits** | Per brief. |

---

## Handoff items

1. **Owner:** create Supabase project; set in `apps/mobile/.env` (gitignored):
   - `EXPO_PUBLIC_SUPABASE_URL=`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY=`  
   Template: root `.env.example` (empty values).
2. Run native DB Health on a physical phone via Expo Go when available.  
3. Folder rename `Larder` → product name when no agent is bound to the path.  
4. M1 track F owns theming/fonts/design system (`DESIGN.md` ignored this run).

---

## Open questions (not guessed)

1. Should `packages/core` keep owning health DDL/checksum long-term, or should that move to a thin `@larder/db-test` package once product schema lands?  
2. Preferred Expo `slug` / deep-link `scheme` for store submission (`my-pantry` / `mypantry` used provisionally)?  
3. When Supabase credentials exist, should web DB Health show a remote connectivity probe, or stay permanently N/A for local SQLite only?  
4. Confirm measurement display default remains US retail (SPEC open item) before M1 units work — not M0-blocking.

---

## Root scripts (working)

```
npm run typecheck   # tsc --noEmit all workspaces
npm run test        # vitest (@larder/core, includes better-sqlite3 proof)
npm run lint        # tsc --noEmit workspaces
npm run web         # expo start --web
npm run start       # expo start (QR for Expo Go)
```

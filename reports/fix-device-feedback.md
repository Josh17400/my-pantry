# Device feedback fixes — TestFlight walk

**Date:** 2026-07-26  
**Scope:** `apps/web/src/**` only (core / supabase / native untouched)  
**Gate:** `npm run typecheck && npm run lint && npm run test && npm run build` — green  
**Tests:** 279 core + 234 web (was 231; +3 greeting cases)  
**Interactivity:** `node apps/web/scripts/verify-interactivity.mjs` — all checks passed  

---

## 1. Demo data ships to real users — CRITICAL

| | |
|---|---|
| **Cause** | `main.tsx` called `repo.initialize({ loadFixtures: true })` unconditionally. Native/TestFlight first runs seeded a stranger’s pantry + grocery fixtures. Home/grocery also fell back to in-memory demo when no repo, including production. |
| **Change** | `loadFixtures` only when `import.meta.env.DEV`. Home `shouldUseDemo()` only in DEV (or explicit `?demo=1`). Grocery demo build only in DEV; production with empty pantry shows empty list. BootGate still seeds catalog/locations without fixture stock. |
| **Proof** | Interactivity script: fresh profile (`?empty=1` / production preview) — no demo grocery markers; home empty invitation; grocery “List is empty”. |

## 2. “Alex” is hardcoded

| | |
|---|---|
| **Cause** | `greeting.ts` defaulted to `DEFAULT_NAME = 'Alex'`; `useHomeScreenData` hard-coded `greetingName: 'Alex'`. |
| **Change** | `fullGreeting(name?)` omits the comma-name when blank. `displayNameFromUser()` uses auth `displayName` / email local-part. Hook subscribes to `getAuthClient()` and never invents a name. |
| **Proof** | Unit tests: null/blank → `"Good afternoon"` / `"Good morning"`, no Alex. Interactivity: greeting text `"Good afternoon"` without a name. |

## 3. Splash / header sequence

| | |
|---|---|
| **Cause** | Boot showed plain “Opening local pantry…”; home stacked Wordmark + tagline + greeting. |
| **Change** | BootGate splash: Wordmark only (“The Good Pantry”). Loaded home header: greeting + settings icon only (no wordmark stack). |
| **Proof** | Visual structure in code; interactivity asserts greeting node + settings navigation (not wordmark+greeting clutter). |

## 4. Entire home screen is inert — CRITICAL

| | |
|---|---|
| **Cause** | Parallel tracks left optional `onClick` / `onSeeAll` unwired (`() => undefined`). |
| **Change** | Wired all destinations: At a Glance → `/pantry?location=…` or `?filter=favorites`; cook-now → `/recipes?filter=can-make`; recipe cards/See all → detail/list; fridge/pantry rails → item detail / filtered pantry; empty CTA → pantry. |
| **Proof** | Interactivity asserts URL changes for glance cards, cook CTA, See alls, recipe card, highlight tile. |

## 5. Segmented control does nothing

| | |
|---|---|
| **Cause** | Local state updated only; body ignored segment. |
| **Change** | Overview shows full body; Fridge/Pantry filter sections on home; Recipes navigates to `/recipes`. Removed from empty first-run (no inert control). |
| **Proof** | Interactivity: Fridge keeps `/` and hides At a Glance; Recipes → `/recipes`. |

## 6. Pantry list wrong name + navigates Home

| | |
|---|---|
| **Cause** | Row linked to `/pantry/:ingredientId/:formId` but router only had `/pantry/:id`. Extra segment matched `*` → `Navigate to="/"`. Name path already used `ingredientName`; defensive display + stable virtual-list keys added. |
| **Change** | Route is `/pantry/:ingredientId/:formId` (matches `PantryItemScreen` / row links). `PantryItemRow` always renders ingredient name (never location). VirtualList keys use `row.key`. Location query filters supported for home deep-links. |
| **Proof** | Interactivity: highlight tile → `/pantry/spinach/spinach-bulk` (not Home). |

## 7. Horizontal overflow

| | |
|---|---|
| **Cause** | Segmented control pills used `shrink-0` without page `min-w-0` / overflow guard; classic flex min-width expansion past 320px. |
| **Change** | `html/body/#root` `overflow-x: hidden`; AppShell + home/pantry `min-w-0 overflow-x-hidden`; SegmentedControl `min-w-0 w-full`, flex-1 pills; rails remain intentional `overflow-x-auto` inside containers. |
| **Proof** | Interactivity: every listed route at 320px has `scrollWidth <= clientWidth`. |

## 8. Tab bar: back to 4 tabs + FAB

| | |
|---|---|
| **Cause** | Five tabs + FAB: `mid = ceil(5/2) = 3` put FAB over the third tab. |
| **Change** | Tabs: Home · Recipes · Pantry · Lists + centre FAB. Settings/Me → home header person icon. Settings still has Diagnostics → DB Health. |
| **Proof** | Interactivity: tab labels exclude Me; settings icon → `/settings` with DB Health link. |

## 9. Lists shows fabricated data

| | |
|---|---|
| **Cause** | Same fixture boot as #1; grocery also defaulted to demo mode. |
| **Change** | Production/native: empty fixtures → empty live list + empty state copy. Demo list only in DEV or explicit design paths. |
| **Proof** | Interactivity: grocery empty state on fresh profile; no demo markers. |

---

## New verification (beyond route screenshots)

`apps/web/scripts/verify-interactivity.mjs` — companion to `screenshot-routes.mjs`:

1. Fresh profile empty states + no demo markers + greeting without invented name  
2. Horizontal overflow at 320px on product routes  
3. Click-through URL assertions for home CTAs / rails / pantry item  
4. Segment behavior + 4-tab bar + settings reachability  

Run after build:

```bash
npm run typecheck && npm run lint && npm run test && npm run build
node apps/web/scripts/verify-interactivity.mjs
```

---

## Could not reproduce / notes

- **“fridge” as every row name:** Not reproduced in code with correct joins (`ingredientName` is the catalog name). The confirmed broken behavior was **tap → Home** from the route mismatch; that is fixed. Defensive naming + list keys remain. If a native device still shows location labels as names after this build, re-check SQLite seed/join on-device (packages/core + db layer were out of scope).  
- **Existing device DB:** Users who already ran a build with fixtures keep that local SQLite data until reset; `loadFixtures` is idempotent and will not wipe stock. New installs / cleared app data start empty.  
- **Web production companion** without a repo: empty home (not demo), unless `?demo=1` for design review.  
- **Auth display names** only appear when Supabase session is present with metadata/email; unsigned local-first use greets without a name.  

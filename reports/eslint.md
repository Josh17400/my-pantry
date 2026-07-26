# ESLint — real linting for The Good Pantry

**Date:** 2026-07-26  
**Scope:** root config, `packages/core`, `apps/web`  
**Out of scope:** `supabase/functions/**` (Deno), `native/**`, `apps/web/scripts/**`

## Summary

`npm run lint` is no longer a typecheck alias. It runs ESLint (flat config) over
core + web. `npm run typecheck` remains separate. All verification gates pass.

| Gate | Result |
|------|--------|
| `npm run lint` | clean (exit 0) |
| `npm run typecheck` | clean (exit 0) |
| `npm run test` | **279** core + **231** web |
| `npm run test:functions` | **65** |
| `npm run build` | succeeds |

No git commits were created.

---

## Config

**File:** `eslint.config.mjs` (flat config; `.mjs` so Node treats it as ESM without
forcing `"type": "module"` on the whole monorepo).

**Dependencies** (root `devDependencies`):

- `eslint@^9`
- `typescript-eslint@^8`
- `@eslint/js@^9`
- `eslint-plugin-react@^7`
- `eslint-plugin-react-hooks@^5`
- `eslint-plugin-simple-import-sort@^12`
- `globals@^16`

(ESLint 10 was rejected: `eslint-plugin-react` does not declare peer support yet.)

### Scripts

| Script | Where | Command |
|--------|--------|---------|
| `lint` | root | `eslint packages/core apps/web` |
| `lint:fix` | root | `eslint packages/core apps/web --fix` |
| `lint` / `lint:fix` | `@larder/core`, `@larder/web` | `eslint .` / `eslint . --fix` |
| `typecheck` | workspaces | still `tsc --noEmit` (unchanged) |

### Layers

1. **Global ignores** — `node_modules`, `dist`, `native/**`, `supabase/functions/**`,
   `apps/web/scripts/**`, `reports/**`, `design/**`.
2. **Base** — `eslint:recommended` + `typescript-eslint` strict + stylistic
   **type-checked** configs, with `projectService: true`.
3. **Shared TS rules** — `no-explicit-any` (error), `no-floating-promises`,
   `no-misused-promises` (void-return attributes allowed for React event handlers),
   `consistent-type-imports` (`import type`, separate type imports;
   `disallowTypeAnnotations: false` so lazy `import('x').Y` in drivers is allowed),
   `simple-import-sort` for imports/exports.
4. **`packages/core` architecture block** — see next section.
5. **`apps/web` React block** — `eslint-plugin-react` (recommended + jsx-runtime),
   `react-hooks` (`rules-of-hooks` error, `exhaustive-deps` warn).
6. **Config files** — type-checking disabled for vite/vitest/drizzle/tailwind/postcss
   configs and plain JS.

---

## Architecture-boundary rule

**Why:** `packages/core` must stay pure TypeScript domain logic — no React, no
Capacitor, no browser globals. That purity is why Expo → Capacitor re-platform
cost almost nothing. Convention + hand grep is not a gate; the build must fail.

**Mechanism:** `no-restricted-imports` + `no-restricted-globals` on
`packages/core/**/*.{ts,tsx}` only.

**Blocked imports (paths):**

- `react`, `react-dom`, `react-native`
- `react-router`, `react-router-dom`

**Blocked import patterns:**

- `react/*`, `react-dom/*`, `react-native/*`
- `@capacitor/*`, `@capacitor-community/*`
- `expo`, `expo-*`, `@expo/*`

**Blocked globals:**

- `window`, `document`, `navigator`, `localStorage`, `sessionStorage`, `indexedDB`

Node globals remain available (vitest / better-sqlite3 tests).

### Evidence it fires

Temporary probe file `packages/core/src/_eslint_arch_probe.ts`:

```ts
import 'react';
export const x = 1;
```

```
npx eslint packages/core/src/_eslint_arch_probe.ts
```

**Result (exit 1):**

```
error  'react' import is restricted from being used.
       packages/core must stay platform-free. No React — keep UI in apps/web
       no-restricted-imports
```

Probe removed after the run. Core lint clean again.

Also re-checked from `packages/core` as cwd (`eslint src/_probe.ts`) — same
restriction fires.

---

## What was fixed (by category)

### Autofix (bulk)

- **Import ordering** (`simple-import-sort`) across core + web.
- **`import type` / separate type imports** (`consistent-type-imports`) across
  barrels, screens, drivers, tests.
- Minor style autofixes from type-aware stylistic rules (e.g. unnecessary
  template wrappers where safe).
- Removed obsolete `// eslint-disable-next-line no-console` directives (no
  `no-console` rule enabled; they were dead).

### Hand fixes (correctness / semantics-preserving)

| Change | Why |
|--------|-----|
| `void navigate(...)` in CookingMode, ImportRecipe, ReceiptReview, Scan, RecipeEdit | React Router v7 `navigate` can return a Promise; satisfies `no-floating-promises` without awaiting navigation |
| Renamed `useTestAds` → `preferTestAds` (monetization config) | Name started with `use` but is **not** a React hook; `rules-of-hooks` false positive. Public surface still exposes `isUsingTestAds()` |
| `datalayer.test.ts`: drop dead `first;` expression | `no-unused-expressions` |
| `useHomeScreenData`: stable `EMPTY_PANTRY_ITEMS` / `EMPTY_LOCATIONS` | Demo-mode `?? []` created a new array every render → `exhaustive-deps` noise |
| Matching fixtures: `let detail: string = result.kind` | Autofix simplified `` `${result.kind}` `` → `result.kind`, which narrowed the variable and broke `tsc` when assigning richer diagnostic templates |

No intentional runtime behavior changes beyond the rename of an internal helper
and `void` on fire-and-forget navigations (same call, promise explicitly ignored).

---

## Deliberately disabled (config-level, with reasons)

Scattered `eslint-disable` comments were **not** used for these. Each off-switch
lives in `eslint.config.mjs` with a comment.

| Rule | Why off |
|------|---------|
| `restrict-template-expressions` / `restrict-plus-operands` | Branded strings / unit keys → mass false positives |
| `strict-boolean-expressions` / `prefer-nullish-coalescing` | Existing `\|\|` / truthiness defaults are intentional |
| `no-non-null-assertion` | Guards + vitest helpers use `!` under strict TS |
| `no-empty-function` / `no-empty-object-type` / `consistent-type-definitions` | DB row shapes and intentional empty handlers |
| `no-unsafe-*` family | JSON/SQLite `unknown` boundaries; codebase is already `any`-free |
| `no-unnecessary-type-conversion` | `Number()`/`String()`/`Boolean()` at driver boundaries document coercion |
| `no-redundant-type-constituents` | `Unit \| string`, `Error \| unknown` document intent |
| `no-deprecated` | Barrel re-exports of `@deprecated` aliases (e.g. `sortAndDedupe`) are public API stability |
| `no-dynamic-delete` / `prefer-for-of` / `prefer-optional-chain` | Style-only; existing cache/index loops fine |
| `no-unnecessary-type-parameters` / `no-invalid-void-type` | Noise vs existing plugin/API typings |
| `no-unnecessary-condition` / `no-unnecessary-type-assertion` / `no-confusing-void-expression` / `only-throw-error` / `require-await` / `prefer-promise-reject-errors` / `no-base-to-string` | Fight established idioms without catching real bugs under strict TS |
| `react/prop-types` | TypeScript owns props |

### Enabled and kept strict

- `@typescript-eslint/no-explicit-any` → **error**
- `@typescript-eslint/no-floating-promises` → **error**
- `@typescript-eslint/no-misused-promises` → **error** (attrs void-return off)
- `react-hooks/rules-of-hooks` → **error**
- `react-hooks/exhaustive-deps` → **warn** (zero remaining after stable empties)
- Architecture `no-restricted-imports` / `no-restricted-globals` on core → **error**

---

## Deviations

1. **ESLint 9, not 10** — plugin peer range; pin until react plugin supports 10.
2. **`eslint.config.mjs` instead of `.js`** — avoids MODULE_TYPELESS warning without
   setting root `"type": "module"`.
3. **`no-misused-promises` allows void-return on JSX attributes** — standard React
   pattern (`onClick={async () => ...}`).
4. **`disallowTypeAnnotations: false`** on consistent-type-imports — drivers use
   `import('better-sqlite3').Database` style types for optional/native deps.
5. **Two intentional `eslint-disable-next-line react-hooks/exhaustive-deps`** remain
   (pre-existing, documented): home recipe hydrate effect and cook page mount
   deps. These are deliberate “don’t re-run on loading toggles” constraints, not
   style noise.

---

## Open questions

1. Should CI add `--max-warnings 0` so any future `exhaustive-deps` warn fails the
   job? Currently warnings do not fail `npm run lint`.
2. Worth adding `eslint-plugin-import` path groups later (e.g. enforce
   `apps/web` never imports deep into core internals outside the package entry)?
   `simple-import-sort` only orders; it does not enforce package boundaries web→core.
3. When `eslint-plugin-react` supports ESLint 10, bump the pin.

---

## Files added / touched (high level)

- **Added:** `eslint.config.mjs`, root ESLint deps in `package.json` / lockfile
- **Scripts:** root + `@larder/core` + `@larder/web` `lint` / `lint:fix`
- **Mass autofix:** import sort + type imports across ~200 TS/TSX files
- **Targeted logic-adjacent fixes:** monetization config rename, navigate `void`,
  home empty-array stability, matching fixture `detail: string`, datalayer test
  cleanup
- **Report:** this file

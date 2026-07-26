# M1 Track F — My Pantry design system

**Status:** complete  
**Date:** 2026-07-26  
**Scope:** `apps/web/src/ui/**`, `apps/web/tailwind.config.js`, `apps/web/src/styles/**`, `apps/web/src/routes/DesignPage.tsx`  
**Not touched:** `packages/core/**`, `apps/web/src/db/**`, `native/**`, `.github/**`

---

## Summary

Built a bespoke mobile-first design system from `DESIGN.md` and the three owner mockups (opened and matched for spacing/hierarchy). No product screens — only tokens, components, a `/design` gallery, and a WCAG AA contrast build gate.

| Gate | Result |
|---|---|
| `npm run typecheck -w @larder/web` | zero errors |
| `npm run test -w @larder/web` | **32** contrast tests pass |
| `npm run test -w @larder/core` | **248** pass (unchanged) |
| `npm run build -w @larder/web` | production build succeeds (fonts self-hosted into `dist/assets`) |
| Screenshot | `reports/design-gallery.png` (390×844 CSS px, 2× DPR, full page) |

Root `npm run test` now runs core **then** web so the contrast gate is part of the workspace test command.

---

## Token structure

Source of truth: `apps/web/src/ui/tokens.ts` (mirrored into Tailwind in `apps/web/tailwind.config.js`).

### Surfaces & brand

| Token | Hex | Tailwind | Role |
|---|---|---|---|
| `bg` | `#ECEAE4` | `bg-bg` | App canvas (warm, darker than it looks) |
| `surface` | `#F7F6F2` | `bg-surface` | Cards (lighter than canvas) |
| `surface-raised` | `#FCFCFC` | `bg-surface-raised` | Sheets, tab bar, elevated |
| `primary` | `#484C20` | `bg-primary` / `text-primary` | FAB, CTA, selected pill — **yellow-olive, hue ≈ 68°** |
| `primary-soft` | `#585C2C` | `bg-primary-soft` | Soft primary variant |
| `text` / `ink` | `#1F1D18` | `text-ink` | Body / headings |
| `text-muted` / `ink.muted` | `#6E6A5A` | `text-ink-muted` | Secondary copy (AA on bg at 4.51:1) |

### Status (split is intentional)

| Token | Hex | Use |
|---|---|---|
| `fresh` | `#3B602D` | Text **and** bar fill |
| `low` | `#8F5410` | **Text only** (“Getting low”) |
| `low-fill` | `#C0741F` | **Bars, dots, icons only** — never text |
| `critical` | `#9B4514` | Text and fill for expiring / almost empty |

`statusTextColor` and `statusFillColor` maps in `tokens.ts` enforce the split. The contrast test fails the build if `low-fill` appears in `statusTextColor`.

### Location tints (decorative)

`sage` `#CCD4BC` · `tan` `#E0D8C0` · `sky` `#CCD4D4` · `cream` `#E0D4C8`

### Derived (not in DESIGN.md palette table)

| Token | Hex | Why |
|---|---|---|
| `bar-track` | `#EFECE4` | Freshness track. Must stay light enough that `low-fill` meets **3:1** non-text contrast; darker warm greys fail against mid-luminance `#C0741F`. |
| `white` | `#FFFFFF` | Inverse text on primary |

---

## Typography & self-hosting

| Role | Face | Package |
|---|---|---|
| Display / headings / wordmark | **Fraunces** 400–700 | `@fontsource/fraunces` |
| Body / UI | **Inter** 400–700 | `@fontsource/inter` |

Loaded in `apps/web/src/styles/fonts.css` via CSS `@import` of local `@fontsource/*` files — **no Google Fonts, no runtime network**. Vite bundles woff2 into `dist/assets/*`. Tailwind:

- `font-display` → Fraunces  
- `font-sans` → Inter (body default)

Section titles use display serif at generous sizes; controls stay Inter. That contrast is deliberate.

---

## Component inventory

All under `apps/web/src/ui/`, barrel-exported from `index.ts`.

| Component | States / props |
|---|---|
| **Wordmark** | sizes `sm` \| `md` \| `lg`; optional tagline; leaf + “My Pantry” |
| **LeafIcon** | decorative or labelled; brand motif |
| **Card** | padding `none`\|`sm`\|`md`\|`lg`; variant `default`\|`raised`; tint sage/tan/sky/cream |
| **SegmentedControl** | controlled options; selected = primary fill + white; 44px min height |
| **Rail** | serif title; optional “See all” or custom trailing; horizontal scroller |
| **TabBar** | N tabs + center **Fab**; `env(safe-area-inset-bottom)` via `pb-safe`; active/inactive ink |
| **Fab** | default / disabled; 56px olive circle; `prefers-reduced-motion` scales off |
| **FreshnessBar** | `value` 0–1; status `fresh`\|`low`\|`critical`; fill vs text colors; optional hide label |
| **StatusBadge** | three bands; custom label; optional fill-dot |
| **StatusText** | three bands; sizes `sm`\|`md`; **never** low-fill |
| **PlaceholderThumb** | name → monogram; four tints; sizes sm/md/lg; leaf watermark |
| **ItemTile** | `card` \| `row`; quantity; status badge or bar; optional image slot (defaults to placeholder) |
| **AdSlot** | free-tier in-feed placeholder; **null** when `paidTier`; `forceShow` for gallery |

Helpers: `cn()`, `contrast.ts` (WCAG luminance/ratio).

### Reduced motion

Global CSS zeros transitions/animations under `prefers-reduced-motion: reduce`. Fab also uses `motion-reduce:` utilities.

### Mobile-first

- Min tap target `min-h-tap` / `min-w-tap` = 44px  
- Safe-area padding on tab bar  
- Gallery and shell max-width ~`max-w-lg` / phone-first padding  

---

## Contrast test results

File: `apps/web/src/ui/contrast.test.ts`  
Command: `npm run test -w @larder/web` (also chained from root `npm run test`)

Thresholds: **4.5:1** normal text · **3.0:1** large text & UI.

| Pair | FG | BG | Ratio | Min | Pass |
|---|---|---|---|---|---|
| text on bg | `#1F1D18` | `#ECEAE4` | 14.00 | 4.5 | ✓ |
| text on surface | `#1F1D18` | `#F7F6F2` | 15.57 | 4.5 | ✓ |
| text on surface-raised | `#1F1D18` | `#FCFCFC` | 16.41 | 4.5 | ✓ |
| text-muted on bg | `#6E6A5A` | `#ECEAE4` | 4.51 | 4.5 | ✓ |
| text-muted on surface | `#6E6A5A` | `#F7F6F2` | 5.01 | 4.5 | ✓ |
| text-muted on surface-raised | `#6E6A5A` | `#FCFCFC` | 5.29 | 4.5 | ✓ |
| fresh on bg | `#3B602D` | `#ECEAE4` | 6.03 | 4.5 | ✓ |
| fresh on surface | `#3B602D` | `#F7F6F2` | 6.70 | 4.5 | ✓ |
| low on bg | `#8F5410` | `#ECEAE4` | 5.07 | 4.5 | ✓ |
| low on surface | `#8F5410` | `#F7F6F2` | 5.64 | 4.5 | ✓ |
| critical on bg | `#9B4514` | `#ECEAE4` | 5.36 | 4.5 | ✓ |
| critical on surface | `#9B4514` | `#F7F6F2` | 5.97 | 4.5 | ✓ |
| white on primary | `#FFFFFF` | `#484C20` | 9.01 | 4.5 | ✓ |
| white on primary-soft | `#FFFFFF` | `#585C2C` | 7.04 | 4.5 | ✓ |
| primary on bg | `#484C20` | `#ECEAE4` | 7.49 | 4.5 | ✓ |
| primary on surface | `#484C20` | `#F7F6F2` | 8.33 | 4.5 | ✓ |
| text on sage | `#1F1D18` | `#CCD4BC` | 10.99 | 4.5 | ✓ |
| text on tan | `#1F1D18` | `#E0D8C0` | 11.83 | 4.5 | ✓ |
| text on sky | `#1F1D18` | `#CCD4D4` | 11.17 | 4.5 | ✓ |
| text on cream | `#1F1D18` | `#E0D4C8` | 11.56 | 4.5 | ✓ |
| primary on sage | `#484C20` | `#CCD4BC` | 5.88 | 3.0 | ✓ |
| primary on tan | `#484C20` | `#E0D8C0` | 6.33 | 3.0 | ✓ |
| primary on sky | `#484C20` | `#CCD4D4` | 5.98 | 3.0 | ✓ |
| primary on cream | `#484C20` | `#E0D4C8` | 6.19 | 3.0 | ✓ |
| fresh fill on bar-track | `#3B602D` | `#EFECE4` | 6.14 | 3.0 | ✓ |
| low-fill on bar-track | `#C0741F` | `#EFECE4` | 3.09 | 3.0 | ✓ |
| critical fill on bar-track | `#9B4514` | `#EFECE4` | 5.46 | 3.0 | ✓ |
| primary on surface (FAB edge) | `#484C20` | `#F7F6F2` | 8.33 | 3.0 | ✓ |

Additional assertions:

- `low-fill` is **not** used in `statusTextColor`  
- `low` ≠ `low-fill`; `low` ≥ 4.5 on bg; `low-fill` **fails** 4.5 on bg (documents the ban)  
- Primary channels prove yellow-olive (G ≥ R > B, G−R &lt; 30)

---

## Ad slot placement (AdMob)

`AdSlot` is an **in-feed card**: dashed surface, ~100px min height, standard phone width inside the content column.

**Why this satisfies accidental-click policy intent:**

1. It is **not** pinned above or adjacent to the bottom `TabBar` or center `Fab`.  
2. It lives in the **scrollable home feed** (gallery demonstrates it mid-stack, far above the docked nav).  
3. Paid tier (`paidTier`) renders **nothing** — no empty chrome.  
4. `data-ad-slot="in-feed"` marks the reservation for future AdMob wiring (M4).

Banner-above-header and interstitial options from DESIGN.md remain open product decisions; the layout gap is reserved as option (1).

---

## “My Pantry” lockup at narrow widths

Mockups show **Larder**; product name is longer. Gallery includes an explicit **320px** dashed box with:

- leaf + “My Pantry” at `size="sm"`  
- tagline under the name  
- notification icon to the right (matches mockup header pressure)

`Wordmark` uses `min-w-0`, non-breaking `My&nbsp;Pantry`, and shrink-safe flex so the leaf does not crush the title. At 320px the lockup fits without wrapping into two ugly lines in the forced-width demo.

---

## `/design` gallery

Route: `apps/web/src/routes/DesignPage.tsx` · path `/design` (full-bleed, no scaffold header).

Renders every component and status band, empty/loaded item rows, short/long truncation, placeholder thumbs (all tints), ad slot free + paid, tab bar + FAB, palette swatches, type scale, CTA sample.

Screenshot: **`reports/design-gallery.png`**.

---

## Deviations

1. **Wordmark text** is “My Pantry”, not mockup “Larder” (per DESIGN.md).  
2. **`bar-track` `#EFECE4`** is not in the measured palette table; chosen so `low-fill` meets UI 3:1. A darker track (e.g. `#E5E2D9`) fails at ~2.81:1.  
3. **Tab icons** are simple strokes, not the mockup’s exact SF-style glyphs — adequate for system review; product screens can refine.  
4. **No food photography** — placeholders only (deliberate leaf + monogram).  
5. Scaffold `HomePage` still uses older zinc utilities for workspace health; design system is opt-in via `ui/*`. App chrome for non-`/design` routes uses warm tokens lightly.  
6. **Instrument Serif** was the alternate; **Fraunces** was chosen (warm optical sizing, free, `@fontsource` ready).

---

## Open questions (not guessed)

1. **Ad strategy beyond in-feed** — keep card-only, add header banner, interstitials, or drop ads for subscription-only? Affects home layout later.  
2. **Tab set** — mockups imply Home / Recipes / Inventory / Me; confirm labels and whether Inventory splits Fridge/Pantry or relies on segmented control.  
3. **Segmented control placement** — under greeting only, sticky under header, or both Overview + location tabs?  
4. **Dark mode** — none in mockups; ship light-only until asked?  
5. **i18n / long wordmarks** — “My Pantry” at 320px is OK in English; translated product names may need a condensed lockup.  
6. **Status copy catalog** — exact strings for fresh/low/critical (Plenty / Getting low / 2 days / Almost empty / Well stocked) should be product-owned copy keys later.

---

## File map

```
apps/web/
  tailwind.config.js
  vitest.config.ts
  package.json                    # +test, +@fontsource/*, clsx, tailwind-merge, vitest
  src/
    index.css
    App.tsx                       # /design full-bleed + Design nav link
    styles/fonts.css
    routes/DesignPage.tsx
    ui/
      tokens.ts, contrast.ts, contrast.test.ts, cn.ts, index.ts
      Wordmark, LeafIcon, Card, SegmentedControl, Rail
      TabBar, Fab, FreshnessBar, StatusBadge, StatusText
      PlaceholderThumb, ItemTile, AdSlot
reports/
  design-gallery.png
  m1-f-design-system.md
```

No git commits created (per brief).

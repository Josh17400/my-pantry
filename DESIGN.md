# The Good Pantry — Design Language

Derived from three owner-approved concept mockups (2026-07-25). These define the target look
and the information architecture.

> **The product name is "The Good Pantry."** The mockups show the working name *Larder* in the
> wordmark — that is the one thing in them not to copy. Everything else about the concepts is
> the target. The wordmark needs redrawing as **The Good Pantry** in the same editorial serif, and
> it is longer, so the header lockup needs checking at small widths.

**Reference images** (in repo — Grok instances should look at these directly):
`design/references/mockup-01-overview.jpg` · `mockup-02-home-stats.jpg` · `mockup-03-greeting.jpg`

---

## The feel

Warm, editorial, calm. Reads like a well-designed cookbook, not a productivity tool. Cream
paper rather than white screen; deep olive rather than tech blue; a serif with real character
for anything that speaks to the user. Food photography is the hero — the app is *about* food,
and the mockups lean on that constantly.

The emotional target is "everything in its place" — the tagline in the mockups. Reassurance,
not urgency. This directly serves the product thesis: an app that tells you the truth about
your kitchen should feel unhurried and trustworthy, not like a dashboard nagging you.

---

## Palette

Sampled from the reference JPEGs by isolating low-local-variance regions (UI chrome is flat;
food photography is not), then contrast-checked against the measured background.

### Measured — high confidence, do not "improve" these

| Token | Hex | Contrast on bg | Notes |
|---|---|---|---|
| `bg` | `#ECEAE4` | — | app canvas. Warm, and **darker than it looks** — not #F5F2EC |
| `surface` | `#F7F6F2` | — | cards sit *lighter* than canvas; very soft shadow |
| `surface-raised` | `#FCFCFC` | — | sheets, elevated cards |
| `primary` | `#484C20` | 7.49:1 | FAB, CTA banner, primary buttons. White on it = 9.01:1 |
| `primary-soft` | `#585C2C` | 5.85:1 | active pill / selected tab |
| `text` | `#1F1D18` | 14.00:1 | warm near-black |

**The primary is a yellow-olive, hue ≈ 68°, not a forest green.** Green barely exceeds red in
the channel values. Anything greener reads as a different brand.

### Chosen and validated — status colors

These could **not** be reliably sampled: they appear only as small anti-aliased text in
compressed JPEGs, giving 3–8px samples whose extremes are compression artifacts. So they are
chosen inside the hue families the mockups establish, then contrast-checked. Two of my
original eyeball values failed WCAG AA and were replaced.

| Token | Hex | On bg | Use |
|---|---|---|---|
| `fresh` | `#3B602D` | 6.03:1 | "Fresh", "Plenty", "Well stocked", full bars |
| `low` | `#8F5410` | 5.07:1 | **"Getting low" text.** ⚠️ The vibrant `#C0741F` is only 3.03:1 and **fails for body text** |
| `low-fill` | `#C0741F` | 3.03:1 | bars, dots, icons **only** — never text |
| `critical` | `#9B4514` | 5.36:1 | "Almost empty", "2 days", expiring |
| `text-muted` | `#6E6A5A` | 4.51:1 | ⚠️ my earlier `#8A8578` is 3.06:1 and **fails for body text** |

### Location tints

Soft washes behind location cards, sampled warm: sage `#CCD4BC` · tan `#E0D8C0` ·
sky `#CCD4D4` · cream `#E0D4C8`. Decorative only — never carry meaning alone.

Warmth is the rule. Every neutral is warm-shifted. A cool gray anywhere will look broken.

> **Accessibility is a build gate, not a review note.** Small colored status text is the
> product's core signal ("2 days", "Getting low") and is exactly what fails contrast. The
> design system ships with a contrast test over every foreground/background token pair.

## Type

- **Display / headings** — high-contrast editorial serif. `The Good Pantry`, `At a Glance`,
  `In Your Fridge`, `Good morning, Alex`. Recommend **Fraunces** (variable, warm, optical
  sizing) or **Instrument Serif**. Both are free and load via `expo-font`.
- **Body / UI** — clean sans. Recommend **Inter** (variable, excellent at small sizes).
- Section headers are serif and generously sized; everything functional is sans. That
  contrast *is* the design — do not sand it down.

## Components

- Cards ~16–20px radius, soft shadow, generous padding
- Pill segmented control (Overview / Recipes / Fridge / Pantry)
- Horizontal scroll rails with "See all" affordances
- Freshness as a **progress bar** with a day count ("3 days left")
- Bottom tab bar with a **floating olive `+` FAB** center — universal quick-add
- Leaf / olive-branch motif as the brand mark

---

## Information architecture the mockups reveal

Three things here are **spec changes**, not styling:

### 1. Locations are user-defined, not an enum

The mockups show Fridge, Pantry, **Around the House**, and Favorites — and "Around the House"
expands into **Spices, Tea & Coffee, Baking, Household**. SPEC v1 had
`locationId: pantry | fridge | freezer`. That is too rigid.

```ts
Location { id, householdId, name, icon, tint, parentId?, sortOrder }
```

Seeded with sensible defaults, fully user-editable, nestable one level. This also closes a
red-team minor finding ("no multi-location beyond pantry|fridge|freezer" — cabin, office fridge).

### 2. Expiration is a home-screen feature — promote M2 → M1

Every mockup surfaces "Expires in 5 days", "3 days left", freshness bars, and
"Recipe Inspiration — **Use up:** spinach, garlic, parmesan". This is not a secondary feature
tucked into M2; it is the emotional core of the home screen and it drives the recipe
suggestions. Expiration tracking moves into **M1**.

### 3. "You have everything for 6 recipes" — cook-now matching is M1 and free

The banner *"Make something amazing — you have everything for 6 recipes"* is prominent, and it
is **not** an AI feature. It is `planCook()` run in reverse across the recipe set: pure core
logic, deterministic, offline, free tier. It must not be confused with or gated behind the
paid AI chef. Ships in M1.

### 4. Quantity display reconciles precise-vs-coarse

Worth noting, because it resolves an earlier design tension. The mockups show **both** at once:

```
Penne Pasta   500g   Plenty
Olive Oil     250ml  Getting low
Parmesan      120g   Expires in 5 days
```

A precise number *and* a qualitative band, together. That is exactly the shape the provenance
layer in `SPEC.md` needs — the number carries the data, the band carries the confidence. The
owner's choice of precise-tracking-everywhere and the trust layer are not in tension; this is
what they look like combined.

---

## Open problem: there is nowhere to put the ad

None of the mockups contain an ad slot, and the layout actively resists one. The bottom is a
tab bar plus a center FAB — and AdMob policy explicitly treats a banner adjacent to navigation
or interactive controls as an accidental-click violation, which is a disable-ads offense.

Options, to resolve before M4 (not now):
1. Native in-feed ad styled as a card in the home scroll, well away from the tab bar
2. Banner directly beneath the header, above scrolling content
3. Interstitial only at natural boundaries (never during cooking mode)
4. Drop ads; subscription-only

Flagging early because it affects layout structure, and retrofitting an ad slot into a design
this tight is worse than designing the gap now.

---

## Content pipeline

The mockups depend on appetizing food photography for every recipe and many ingredients. That
is a real content dependency, not decoration. Per project policy Grok is the sole image
generator: recurring subjects get one base image with `image_edit` variants. Budget this as
its own M1/M3 track — ~50 catalog recipes each need a hero image, plus ingredient thumbnails
for common items.

Placeholder strategy until then: tinted cards with the leaf motif and a bold ingredient
initial. Must look deliberate, never like a broken image.

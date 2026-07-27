# Fix: paywall invents prices when RevenueCat is unavailable

**Date:** 2026-07-27  
**Scope:** `apps/web/src/features/monetization/**` only  
**Commits:** none (per brief)

## Problem

`NativePurchasesBridge.getOfferings()` returned `FALLBACK_OFFERS` (hardcoded `$4.99/mo` and `$39.99/yr`, including an annual plan that does not exist in App Store Connect) whenever:

- the RevenueCat plugin failed to load
- the store returned zero products
- any error was thrown (missing/invalid API key, network, etc.)

The paywall looked like a normal purchase screen for prices the app cannot charge. Tapping a plan hit `Unknown product: …`. That is review-risk and hides misconfiguration.

## Principle

**Real store data, an honest unavailable state, or labelled demo — never fiction presented as real.**

(Same separation as quick-eat: live vs demo never mixed.)

## What the paywall shows now

| State | Platform | UI |
| --- | --- | --- |
| Store returns N packages/products | Native | Exactly those N plan buttons; `priceString` from the store object only |
| Monthly only (current ASC reality) | Native | One plan button; no annual slot, placeholder, or annual copy |
| Monthly + annual | Native | Two plan buttons; store prices (locale-formatted as returned) |
| Plugin missing / failed load | Native | Unavailable card (`plugin_unavailable`); **no** plan buttons; **Restore purchases** still shown |
| Zero products from RC / store | Native | Unavailable card (`no_products`); restore still shown |
| Missing / placeholder API key | Native | Unavailable card (`not_configured`) + clear `console.warn`; restore still shown |
| Thrown store/network error | Native | Unavailable card (`network` or `error`) + `console.warn` with reason; restore still shown |
| Browser DEV | Web | Sample fixtures (`isSamplePricing: true`) + banner **“Sample pricing · Demo mode — not store prices”** |
| Browser production | Web | Unavailable (subscriptions complete in app stores); restore still shown (web restore still explains app-only) |
| Already paid | Any | Unchanged “You’re on Pro” state |

Loading: brief “Loading plans…” until the first offerings result arrives.

## How demo is kept out of native

1. **`getOfferings()` return type is `OfferingsResult`**, not a bare `ProductOffer[]`:
   - `status: 'ready'` + `offers` + `isSamplePricing`
   - `status: 'unavailable'` + `reason` + `message`
2. **`NativePurchasesBridge` never returns `SAMPLE_OFFERS` / `FALLBACK_OFFERS`.** Failure paths call `unavailableOfferings(...)` and log one clear warning naming the reason and that sample pricing is not being used.
3. **Sample fixtures live only on the web bridge in `import.meta.env.DEV`**, via `sampleOfferingsResult()` with `isSamplePricing: true`. Production web does not use fixtures.
4. **`PaywallScreen`** maps whatever list it is given (`readyOffers.map`) — no hardcoded two-slot layout, no annual assumption. Sample banner renders only when `isSamplePricing`. Unavailable card uses `data-paywall-unavailable` / `data-paywall-unavailable-reason`.
5. **Restore** lives in `data-paywall-actions`, sibling to plans — not inside the offers map — so it remains reachable when plans fail.

Prices on live paths always come from `product.priceString` (`productToOffer`). Empty store price stays empty; we never substitute `$4.99` / `$39.99`.

## Files touched

| File | Change |
| --- | --- |
| `types.ts` | `OfferingsResult`, `OfferingsUnavailableReason` |
| `purchases.ts` | Offerings honesty, sample vs unavailable helpers, native factory for tests |
| `PaywallScreen.tsx` | Render ready / unavailable / sample; dynamic plans; restore always |
| `index.ts` | Export new types/helpers |
| `monetization.test.ts` | New offerings + paywall honesty cases |

## Verification (ran locally)

```
npm run typecheck && npm run lint && npm run test && npm run build
```

All succeeded.

### Suite counts observed

| Suite | Test files | Tests |
| --- | --- | --- |
| `@larder/core` | 30 passed | **315** passed |
| `@larder/web` | 30 passed | **366** passed |
| **Total** | **60** | **681** passed |

`monetization.test.ts` alone: **33 passed** (17 prior + 16 new honesty cases).

Build: `vite build` completed (`546` modules, exit 0).

### New tests cover

- native + offerings throw → unavailable; sample prices absent from result
- native + misconfigured key → `not_configured`
- native + zero products → unavailable, not fixtures
- native + plugin null → `plugin_unavailable`
- native + monthly only → one plan, no annual
- native + both products → two plans, store prices
- non-native DEV → fixtures with `isSamplePricing`
- Restore not gated on offers; PaywallScreen source checks
- restore/purchase surface still behaves for success / unknown product

## Adjacent issues found (not fixed)

1. **`getProducts` still requests both `good_pantry_pro_monthly` and `good_pantry_pro_annual`.** Harmless: the store returns only existing SKUs. When annual is created later it will appear without code changes. Optional cleanup: request only products known to exist once dashboard is stable.
2. **Web production restore** still returns a fixed “available in iOS/Android apps” error — correct for no web IAP, but the paywall still shows the Restore button (required for parity with the native unavailable path). No UX copy that restore is app-only until the user taps it.
3. **`FALLBACK_OFFERS` is kept as an alias of `SAMPLE_OFFERS`** so tests and any external reference can assert fixtures exist but do not leak into native results. Could delete the alias later if nothing imports it outside tests.
4. **No React Testing Library** in the web package — “Restore reachable in unavailable state” is enforced via structure + source assertions and bridge unit tests, not a rendered DOM click path.
5. **`reports/screens/paywall.png`** (and similar) may still show the old two-plan invented UI; screenshot refresh is outside this fix.
6. **Entitlement refresh** still swallows RC errors quietly when resolving tier (`entitlement-store.ts`); that path never invented prices, but a missing key remains less visible there than on the paywall offerings path. Out of scope for “what the paywall displays.”

## Ambiguities / judgement calls

- **Production web:** brief allowed fixtures for non-native demo (`import.meta.env.DEV`). Production web gets **unavailable**, not sample pricing — honest and consistent with “never fiction as real.”
- **Unavailable reasons** are classified from error text (`not_configured` / `plugin_unavailable` / `network` / `error`) plus explicit zero-product / missing-key branches.

## Purchase / restore logic

Unchanged intentionally: `purchase()`, `restore()`, and the entitlement store still own transaction and tier resolution. Only **what the paywall is allowed to display** when the store is unreachable was fixed.

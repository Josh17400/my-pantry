import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it } from 'vitest';

import { RC_PRODUCTS } from './config';
import { useEntitlementStore } from './entitlement-store';
import {
  adsAllowedOnRoute,
  buildDataExport,
  classifyOfferingsError,
  createNativePurchasesBridgeForTests,
  createWebPurchasesBridgeForTests,
  exportToJsonString,
  FALLBACK_OFFERS,
  FREE_RECEIPT_SCANS_PER_MONTH,
  freeSnapshot,
  isPaidPlan,
  isValidDataExport,
  offeringsFromStoreProducts,
  paidSnapshot,
  parseExportJson,
  PAYWALL_FEATURES,
  planToTier,
  productToOffer,
  remainingFreeScans,
  SAMPLE_OFFERS,
  sampleOfferingsResult,
  shouldShowAd,
  tierFromRevenueCatCustomerInfo,
  tierFromSessionMetadata,
  unavailableOfferings,
} from './index';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('entitlement gating (free vs paid)', () => {
  it('recognizes paid plan strings used by edge functions', () => {
    expect(isPaidPlan('free')).toBe(false);
    expect(isPaidPlan(undefined)).toBe(false);
    expect(isPaidPlan('paid')).toBe(true);
    expect(isPaidPlan('pro')).toBe(true);
    expect(isPaidPlan('unlimited')).toBe(true);
    expect(planToTier('pro')).toBe('paid');
    expect(planToTier('free')).toBe('free');
  });

  it('reads plan from session app_metadata (server mirror)', () => {
    expect(
      tierFromSessionMetadata({ plan: 'pro' }, {}),
    ).toBe('paid');
    expect(
      tierFromSessionMetadata({}, { plan: 'paid' }),
    ).toBe('paid');
    expect(tierFromSessionMetadata({}, {})).toBe('free');
  });

  it('reads active RevenueCat entitlements', () => {
    expect(
      tierFromRevenueCatCustomerInfo({
        entitlements: { active: { good_pantry_pro: {} } },
      }),
    ).toBe('paid');
    expect(
      tierFromRevenueCatCustomerInfo({
        entitlements: { active: {} },
      }),
    ).toBe('free');
  });

  it('paywall matrix keeps free pantry useful', () => {
    const pantry = PAYWALL_FEATURES.find((f) => f.id === 'pantry');
    const chef = PAYWALL_FEATURES.find((f) => f.id === 'chef');
    expect(pantry?.free).toBe(true);
    expect(chef?.free).toBe(false);
    expect(chef?.paid).toBe(true);
  });

  it('free scan remaining helper matches SPEC default', () => {
    expect(FREE_RECEIPT_SCANS_PER_MONTH).toBe(15);
    expect(remainingFreeScans(0)).toBe(15);
    expect(remainingFreeScans(15)).toBe(0);
    expect(remainingFreeScans(20)).toBe(0);
  });

  it('entitlement store local tier flips isPaid for UI only', () => {
    useEntitlementStore.getState().setLocalTier('free');
    expect(useEntitlementStore.getState().isPaid()).toBe(false);
    useEntitlementStore.getState().setLocalTier('paid');
    expect(useEntitlementStore.getState().isPaid()).toBe(true);
    useEntitlementStore.getState().setLocalTier('free');
  });

  it('snapshots carry source without trusting client for server', () => {
    expect(freeSnapshot().tier).toBe('free');
    expect(paidSnapshot('revenuecat').source).toBe('revenuecat');
  });
});

describe('AdSlot visibility', () => {
  it('hides when subscribed (isPaid)', () => {
    expect(shouldShowAd({ isPaid: true, paidTier: false })).toBe(false);
  });

  it('hides when paidTier prop true', () => {
    expect(shouldShowAd({ isPaid: false, paidTier: true })).toBe(false);
  });

  it('shows for free tier', () => {
    expect(shouldShowAd({ isPaid: false, paidTier: false })).toBe(true);
    expect(shouldShowAd({ isPaid: false })).toBe(true);
  });

  it('forceShow wins for design gallery', () => {
    expect(
      shouldShowAd({ isPaid: true, paidTier: true, forceShow: true }),
    ).toBe(true);
  });

  it('cooking route forbids ads', () => {
    expect(adsAllowedOnRoute('/recipes/abc/cooking')).toBe(false);
    expect(adsAllowedOnRoute('/')).toBe(true);
    expect(adsAllowedOnRoute('/settings')).toBe(true);
  });
});

describe('AdSlot absent from cooking mode', () => {
  it('CookingModeScreen still has no AdSlot', () => {
    const src = readFileSync(
      path.join(here, '../cooking/CookingModeScreen.tsx'),
      'utf8',
    );
    expect(src).not.toMatch(/\bAdSlot\b/);
    expect(src).not.toMatch(/data-ad-slot/);
  });

  it('App cooking branch is outside AppShell (no tab bar ads surface)', () => {
    const app = readFileSync(path.join(here, '../../App.tsx'), 'utf8');
    expect(app).toContain("pathname.includes('/cooking')");
    // Cooking routes before AppShell return
    const cookingIdx = app.indexOf("pathname.includes('/cooking')");
    const shellIdx = app.indexOf('<AppShell>');
    expect(cookingIdx).toBeGreaterThan(-1);
    expect(shellIdx).toBeGreaterThan(cookingIdx);
  });
});

describe('export produces valid JSON', () => {
  beforeEach(() => {
    /* pure */
  });

  it('buildDataExport + parse round-trip', () => {
    const data = buildDataExport({
      householdId: 'hh-test',
      exportedAt: '2026-07-26T12:00:00.000Z',
      pantry: [
        {
          householdId: 'hh-test',
          ingredientId: 'flour-ap',
          ingredientName: 'All-purpose flour',
          formId: 'flour-ap-bulk',
          formName: 'bulk',
          locationId: 'pantry',
          locationName: 'Pantry',
          qtyBase: 1000,
          dim: 'mass',
          parLevelBase: 500,
          lowThresholdPct: 25,
          lastVerifiedAt: null,
          unverifiedCookCount: 0,
          openedAt: null,
          expiresAt: null,
          updatedAt: '2026-07-26T11:00:00.000Z',
          watermarkCursor: null,
          lastAbsoluteCursor: null,
          isNegative: false,
          conflict: false,
        },
      ],
      recipes: [
        {
          id: 'r1',
          householdId: 'hh-test',
          title: 'Toast',
          servings: 1,
          prepMin: 2,
          cookMin: 3,
          visibility: 'private',
          tags: ['breakfast'],
          imageUrl: null,
          updatedAt: '2026-07-26T11:00:00.000Z',
          yieldNote: null,
          authorId: null,
          forkedFrom: null,
          createdAt: '2026-07-26T10:00:00.000Z',
          ingredients: [
            {
              id: 'li1',
              sortOrder: 0,
              rawText: 'bread',
              qty: 2,
              unit: 'each',
              optional: false,
              ingredientId: 'bread',
            },
          ],
          steps: [
            {
              id: 's1',
              sortOrder: 0,
              text: 'Toast it',
              durationSec: 120,
            },
          ],
        },
      ],
      history: [
        {
          id: 't1',
          kind: 'relative',
          reason: 'cook',
          ingredientId: 'flour-ap',
          formId: 'flour-ap-bulk',
          deltaBase: -50,
          targetBase: null,
          occurredAt: '2026-07-25T18:00:00.000Z',
          refId: 'r1',
        },
      ],
    });

    expect(data.schemaVersion).toBe(1);
    expect(data.app).toBe('the-good-pantry');
    expect(data.pantry).toHaveLength(1);
    expect(data.recipes[0]?.title).toBe('Toast');

    const raw = exportToJsonString(data);
    const parsed = JSON.parse(raw) as unknown;
    expect(isValidDataExport(parsed)).toBe(true);
    const round = parseExportJson(raw);
    expect(round).not.toBeNull();
    expect(round?.pantry[0]?.ingredientId).toBe('flour-ap');
    expect(round?.history).toHaveLength(1);
  });

  it('rejects invalid export JSON', () => {
    expect(parseExportJson('{"schemaVersion":2}')).toBeNull();
    expect(parseExportJson('not-json')).toBeNull();
    expect(isValidDataExport(null)).toBe(false);
  });
});

describe('AdSlot source wiring', () => {
  it('AdSlot uses shouldShowAd / entitlement store', () => {
    const src = readFileSync(path.join(here, '../../ui/AdSlot.tsx'), 'utf8');
    expect(src).toContain('shouldShowAd');
    expect(src).toContain('useEntitlementStore');
    expect(src).toContain('prepareInFeedAd');
    expect(src).toContain('data-ad-slot="in-feed"');
  });
});

// ---------------------------------------------------------------------------
// Offerings honesty: real store / unavailable / labelled demo — never fiction
// ---------------------------------------------------------------------------

const SAMPLE_PRICE_MONTHLY = '$4.99/mo';
const SAMPLE_PRICE_ANNUAL = '$39.99/yr';

function assertNoSamplePrices(value: unknown): void {
  const raw = JSON.stringify(value);
  expect(raw).not.toContain(SAMPLE_PRICE_MONTHLY);
  expect(raw).not.toContain(SAMPLE_PRICE_ANNUAL);
  expect(raw).not.toContain('Sample pricing for design review');
}

function mockPlugin(partial: {
  getOfferings?: () => Promise<{
    current?: {
      availablePackages?: {
        identifier?: string;
        product?: {
          identifier?: string;
          title?: string;
          description?: string;
          priceString?: string;
          subscriptionPeriod?: string;
        };
      }[];
    };
  }>;
  getProducts?: (opts: {
    productIdentifiers: string[];
  }) => Promise<{
    products?: {
      identifier: string;
      title: string;
      description: string;
      priceString: string;
      subscriptionPeriod?: string;
    }[];
  }>;
}): {
  configure: (opts: { apiKey: string }) => Promise<void>;
  getOfferings: NonNullable<typeof partial.getOfferings>;
  getProducts: NonNullable<typeof partial.getProducts>;
  purchaseStoreProduct: () => Promise<object>;
  purchasePackage: () => Promise<object>;
  restorePurchases: () => Promise<object>;
  getCustomerInfo: () => Promise<object>;
  logIn: () => Promise<void>;
} {
  return {
    configure: async () => {},
    getOfferings:
      partial.getOfferings ??
      (async () => ({ current: { availablePackages: [] } })),
    getProducts:
      partial.getProducts ?? (async () => ({ products: [] })),
    purchaseStoreProduct: async () => ({}),
    purchasePackage: async () => ({}),
    restorePurchases: async () => ({}),
    getCustomerInfo: async () => ({}),
    logIn: async () => {},
  };
}

describe('offerings: native never invents prices', () => {
  it('native + offerings throw → unavailable; sample prices appear nowhere', async () => {
    const plugin = mockPlugin({
      getOfferings: async () => {
        throw new Error('network timeout contacting store');
      },
    });
    const bridge = createNativePurchasesBridgeForTests({ plugin });
    const result = await bridge.getOfferings();

    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.reason).toBe('network');
    assertNoSamplePrices(result);
    expect(FALLBACK_OFFERS.some((o) => o.priceString === SAMPLE_PRICE_MONTHLY)).toBe(
      true,
    );
    // Fixtures still exist for demo, but must not leak into this result.
    expect(JSON.stringify(result)).not.toContain(SAMPLE_PRICE_MONTHLY);
    expect(JSON.stringify(result)).not.toContain(SAMPLE_PRICE_ANNUAL);
  });

  it('native + misconfigured API key → unavailable not_configured with loggable message', async () => {
    const bridge = createNativePurchasesBridgeForTests({
      plugin: mockPlugin({}),
      resolveApiKey: () => undefined,
    });
    const result = await bridge.getOfferings();
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.reason).toBe('not_configured');
    expect(result.message.toLowerCase()).toMatch(/api key|not configured/);
    assertNoSamplePrices(result);
  });

  it('native + zero products → unavailable, not fixtures', async () => {
    const plugin = mockPlugin({
      getOfferings: async () => ({ current: { availablePackages: [] } }),
      getProducts: async () => ({ products: [] }),
    });
    const bridge = createNativePurchasesBridgeForTests({ plugin });
    const result = await bridge.getOfferings();

    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.reason).toBe('no_products');
    assertNoSamplePrices(result);
  });

  it('native + plugin null → unavailable plugin_unavailable, not fixtures', async () => {
    const bridge = createNativePurchasesBridgeForTests({ plugin: null });
    const result = await bridge.getOfferings();
    expect(result.status).toBe('unavailable');
    if (result.status !== 'unavailable') return;
    expect(result.reason).toBe('plugin_unavailable');
    assertNoSamplePrices(result);
  });

  it('native + monthly only → exactly one plan, no annual affordance', async () => {
    const monthlyStorePrice = '$5.99';
    const plugin = mockPlugin({
      getOfferings: async () => ({ current: { availablePackages: [] } }),
      getProducts: async () => ({
        products: [
          {
            identifier: RC_PRODUCTS.monthly,
            title: 'Pro Monthly',
            description: 'From the store',
            priceString: monthlyStorePrice,
            subscriptionPeriod: 'P1M',
          },
        ],
      }),
    });
    const bridge = createNativePurchasesBridgeForTests({ plugin });
    const result = await bridge.getOfferings();

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.isSamplePricing).toBe(false);
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]?.id).toBe(RC_PRODUCTS.monthly);
    expect(result.offers[0]?.priceString).toBe(monthlyStorePrice);
    expect(result.offers[0]?.period).toBe('month');
    expect(result.offers.some((o) => o.id === RC_PRODUCTS.annual)).toBe(false);
    expect(result.offers.some((o) => o.period === 'year')).toBe(false);
    assertNoSamplePrices(result);
  });

  it('native + both products → two plans, prices from store objects', async () => {
    const monthlyPrice = '€4,49';
    const annualPrice = '€39,99';
    const plugin = mockPlugin({
      getOfferings: async () => ({
        current: {
          availablePackages: [
            {
              identifier: '$rc_monthly',
              product: {
                identifier: RC_PRODUCTS.monthly,
                title: 'Monthly',
                description: 'Store monthly',
                priceString: monthlyPrice,
                subscriptionPeriod: 'P1M',
              },
            },
            {
              identifier: '$rc_annual',
              product: {
                identifier: RC_PRODUCTS.annual,
                title: 'Annual',
                description: 'Store annual',
                priceString: annualPrice,
                subscriptionPeriod: 'P1Y',
              },
            },
          ],
        },
      }),
    });
    const bridge = createNativePurchasesBridgeForTests({ plugin });
    const result = await bridge.getOfferings();

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.isSamplePricing).toBe(false);
    expect(result.offers).toHaveLength(2);
    expect(result.offers[0]?.priceString).toBe(monthlyPrice);
    expect(result.offers[1]?.priceString).toBe(annualPrice);
    expect(result.offers.map((o) => o.id).sort()).toEqual(
      [RC_PRODUCTS.annual, RC_PRODUCTS.monthly].sort(),
    );
    assertNoSamplePrices(result);
  });

  it('productToOffer never invents a priceString when store omits it', () => {
    const offer = productToOffer({
      identifier: RC_PRODUCTS.monthly,
      title: 'Monthly',
    });
    expect(offer.priceString).toBe('');
    expect(offer.priceString).not.toBe(SAMPLE_PRICE_MONTHLY);
  });

  it('offeringsFromStoreProducts empty → unavailable no_products', () => {
    const result = offeringsFromStoreProducts([]);
    expect(result).toEqual(unavailableOfferings('no_products'));
  });

  it('classifyOfferingsError maps key / network / other', () => {
    expect(
      classifyOfferingsError(
        new Error('RevenueCat API key not configured (VITE_REVENUECAT_IOS_API_KEY)'),
      ),
    ).toBe('not_configured');
    expect(classifyOfferingsError(new Error('network timeout'))).toBe('network');
    expect(classifyOfferingsError(new Error('something else'))).toBe('error');
  });
});

describe('offerings: non-native demo sample pricing', () => {
  it('sampleOfferingsResult flags sample pricing and uses SAMPLE_OFFERS', () => {
    const result = sampleOfferingsResult();
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.isSamplePricing).toBe(true);
    expect(result.offers).toEqual(SAMPLE_OFFERS);
    expect(result.offers.some((o) => o.priceString === SAMPLE_PRICE_MONTHLY)).toBe(
      true,
    );
    expect(result.offers.every((o) => /sample/i.test(o.title + o.description))).toBe(
      true,
    );
  });

  it('web bridge in DEV returns sample pricing fixtures', async () => {
    // vitest / vite test env is DEV
    expect(import.meta.env.DEV).toBe(true);
    const bridge = createWebPurchasesBridgeForTests();
    const result = await bridge.getOfferings();
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.isSamplePricing).toBe(true);
    expect(result.offers).toHaveLength(2);
    expect(result.offers[0]?.priceString).toBe(SAMPLE_PRICE_MONTHLY);
  });
});

describe('PaywallScreen: unavailable keeps Restore; dynamic plan list', () => {
  it('Restore purchases is not gated on offers length / availability', () => {
    const src = readFileSync(path.join(here, 'PaywallScreen.tsx'), 'utf8');
    expect(src).toContain('data-paywall-restore');
    expect(src).toContain('data-paywall-unavailable');
    expect(src).toContain('Restore purchases');
    // Restore lives in data-paywall-actions, sibling to plans — not inside readyOffers.map
    expect(src).toMatch(/data-paywall-actions[\s\S]*data-paywall-restore/);
    expect(src).toContain('readyOffers.map');
    // Must not hardcode two plan slots or annual-only affordance
    expect(src).not.toMatch(/good_pantry_pro_annual/);
    expect(src).not.toMatch(/\$4\.99/);
    expect(src).not.toMatch(/\$39\.99/);
  });

  it('sample pricing banner is labelled like quick-eat demo mode', () => {
    const src = readFileSync(path.join(here, 'PaywallScreen.tsx'), 'utf8');
    expect(src).toContain('data-paywall-sample-pricing');
    expect(src).toMatch(/Sample pricing\s*·\s*Demo mode/);
  });

  it('purchases.ts never returns FALLBACK/SAMPLE on native failure paths', () => {
    const src = readFileSync(path.join(here, 'purchases.ts'), 'utf8');
    // Failure branches must call unavailableOfferings, not SAMPLE/FALLBACK
    expect(src).toContain("unavailableOfferings('plugin_unavailable')");
    expect(src).toContain("unavailableOfferings('no_products')");
    expect(src).toContain('unavailableOfferings(reason');
    // Native getOfferings must not return SAMPLE_OFFERS / FALLBACK_OFFERS
    const nativeClass = src.slice(
      src.indexOf('class NativePurchasesBridge'),
      src.indexOf('class WebPurchasesBridge'),
    );
    expect(nativeClass).not.toMatch(/return SAMPLE_OFFERS/);
    expect(nativeClass).not.toMatch(/return FALLBACK_OFFERS/);
    expect(nativeClass).not.toMatch(/return sampleOfferingsResult/);
  });
});

describe('purchase/restore logic unchanged at surface', () => {
  it('native restore still succeeds when plugin restorePurchases works', async () => {
    const plugin = mockPlugin({});
    plugin.restorePurchases = async () => ({ customerInfo: { ok: true } });
    const bridge = createNativePurchasesBridgeForTests({ plugin });
    // restore does not depend on offerings success
    const result = await bridge.restore();
    expect(result.ok).toBe(true);
  });

  it('native purchase of unknown product still reports Unknown product', async () => {
    const plugin = mockPlugin({
      getOfferings: async () => ({ current: { availablePackages: [] } }),
      getProducts: async () => ({ products: [] }),
    });
    const bridge = createNativePurchasesBridgeForTests({ plugin });
    const result = await bridge.purchase('no_such_sku');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Unknown product/);
  });
});

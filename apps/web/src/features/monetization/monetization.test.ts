import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach,describe, expect, it } from 'vitest';

import { useEntitlementStore } from './entitlement-store';
import {
  adsAllowedOnRoute,
  buildDataExport,
  exportToJsonString,
  FREE_RECEIPT_SCANS_PER_MONTH,
  freeSnapshot,
  isPaidPlan,
  isValidDataExport,
  paidSnapshot,
  parseExportJson,
  PAYWALL_FEATURES,
  planToTier,
  remainingFreeScans,
  shouldShowAd,
  tierFromRevenueCatCustomerInfo,
  tierFromSessionMetadata,
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

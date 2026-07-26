import { describe, expect, it } from 'vitest';
import {
  BULK_LOW_THRESHOLD_PCT,
  computeParLevel,
  DEFAULT_LOW_THRESHOLD_PCT,
  filterSeasonalPurchases,
  median,
  MIN_PURCHASES_TO_LEARN,
  packageSeed,
  SEASONAL_GAP_MS,
  STAPLE_LOW_THRESHOLD_PCT,
} from '../../src/pantry';

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

const DAY = 24 * 60 * 60 * 1000;
const BASE = Date.UTC(2024, 0, 1);

describe('par levels — cold start', () => {
  it('0 purchases uses package seed', () => {
    const r = computeParLevel({
      packageSeed: packageSeed(2268, '5lb flour'),
      purchases: [],
    });
    expect(r.source).toBe('seed');
    expect(r.parLevelBase).toBe(2268);
    expect(r.purchasesUsed).toBe(0);
  });

  it('1–2 purchases still use package seed (need 3+)', () => {
    const purchases = [
      { qtyBase: 1000, occurredAt: iso(BASE) },
      { qtyBase: 1000, occurredAt: iso(BASE + 7 * DAY) },
    ];
    expect(purchases.length).toBeLessThan(MIN_PURCHASES_TO_LEARN);
    const r = computeParLevel({
      packageSeed: packageSeed(2268),
      purchases,
    });
    expect(r.source).toBe('seed');
    expect(r.parLevelBase).toBe(2268);
    expect(r.purchasesUsed).toBe(2);
  });

  it('user override always wins', () => {
    const r = computeParLevel({
      packageSeed: packageSeed(100),
      purchases: [
        { qtyBase: 500, occurredAt: iso(BASE) },
        { qtyBase: 500, occurredAt: iso(BASE + DAY) },
        { qtyBase: 500, occurredAt: iso(BASE + 2 * DAY) },
      ],
      userOverrideBase: 777,
    });
    expect(r.source).toBe('override');
    expect(r.parLevelBase).toBe(777);
  });
});

describe('par levels — seasonal turkey', () => {
  it('annual purchases do not feed multi-year median', () => {
    const purchases = [
      { qtyBase: 7000, occurredAt: iso(Date.UTC(2021, 10, 20)) },
      { qtyBase: 7200, occurredAt: iso(Date.UTC(2022, 10, 22)) },
      { qtyBase: 7100, occurredAt: iso(Date.UTC(2023, 10, 21)) },
    ];
    const { kept, dropped } = filterSeasonalPurchases(purchases);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.qtyBase).toBe(7100);
    expect(dropped).toBe(2);

    const r = computeParLevel({
      packageSeed: packageSeed(7000, 'turkey'),
      purchases,
      seasonalTag: true,
    });
    // Latest cluster size 1 → cannot learn → package seed.
    expect(r.source).toBe('seed');
    expect(r.parLevelBase).toBe(7000);
  });

  it('tight cluster within a season still learns', () => {
    const purchases = [
      { qtyBase: 2000, occurredAt: iso(BASE) },
      { qtyBase: 2000, occurredAt: iso(BASE + 5 * DAY) },
      { qtyBase: 2000, occurredAt: iso(BASE + 10 * DAY) },
    ];
    const r = computeParLevel({ purchases, seasonalTag: true });
    expect(r.source).toBe('learned');
    expect(r.medianPurchaseQty).toBe(2000);
  });
});

describe('par levels — bulk buyer', () => {
  it('raises low threshold so alert is not delayed to 25% of huge bag', () => {
    // 25 lb rice ≈ 11340 g, bought monthly (~30d is not bulk; use 60d+).
    const purchases = [
      { qtyBase: 11340, occurredAt: iso(BASE) },
      { qtyBase: 11340, occurredAt: iso(BASE + 60 * DAY) },
      { qtyBase: 11340, occurredAt: iso(BASE + 120 * DAY) },
    ];
    // Note: 60d gaps are exactly BULK_DAYS_BETWEEN; seasonal gap is 120d so
    // all three stay in one cluster only if gaps ≤ 120. 60 ≤ 120 → kept.
    const r = computeParLevel({
      packageSeed: packageSeed(2268, '5lb rice'),
      purchases,
    });
    expect(r.source).toBe('learned');
    expect(r.parLevelBase).toBe(11340);
    expect(r.lowThresholdPct).toBe(BULK_LOW_THRESHOLD_PCT);
    const lateAtDefault = r.parLevelBase * DEFAULT_LOW_THRESHOLD_PCT;
    const alertAt = r.parLevelBase * r.lowThresholdPct;
    expect(alertAt).toBeGreaterThan(lateAtDefault);
  });
});

describe('par levels — alternating package sizes', () => {
  it('12 oz / 32 oz coffee does not oscillate wildly (median stable)', () => {
    const oz12 = 340;
    const oz32 = 907;
    const purchases = [
      { qtyBase: oz12, occurredAt: iso(BASE) },
      { qtyBase: oz32, occurredAt: iso(BASE + 14 * DAY) },
      { qtyBase: oz12, occurredAt: iso(BASE + 28 * DAY) },
      { qtyBase: oz32, occurredAt: iso(BASE + 42 * DAY) },
      { qtyBase: oz12, occurredAt: iso(BASE + 56 * DAY) },
      { qtyBase: oz32, occurredAt: iso(BASE + 70 * DAY) },
    ];

    const r = computeParLevel({
      packageSeed: packageSeed(oz12, 'coffee'),
      purchases,
    });
    expect(r.source).toBe('learned');
    expect(r.medianPurchaseQty).toBe(
      median([oz12, oz32, oz12, oz32, oz12, oz32]),
    );

    const r2 = computeParLevel({
      packageSeed: packageSeed(oz12, 'coffee'),
      purchases: purchases.slice(0, 5),
    });
    expect(r2.medianPurchaseQty).toBe(oz12);
    const ratio =
      Math.max(r.parLevelBase, r2.parLevelBase) /
      Math.min(r.parLevelBase, r2.parLevelBase);
    expect(ratio).toBeLessThan(oz32 / oz12);
  });
});

describe('par levels — high-frequency milk', () => {
  it('lowers threshold on frequent cadence (incl. staples) to cut alert fatigue', () => {
    // Spec: a household buying 2 gallons every 3 days must not read LOW constantly.
    // Frequent cadence (≤5d) pulls threshold down to 0.20 even for staples.
    const gal2 = 7570;
    const purchases = [
      { qtyBase: gal2, occurredAt: iso(BASE) },
      { qtyBase: gal2, occurredAt: iso(BASE + 3 * DAY) },
      { qtyBase: gal2, occurredAt: iso(BASE + 6 * DAY) },
      { qtyBase: gal2, occurredAt: iso(BASE + 9 * DAY) },
    ];
    const staple = computeParLevel({
      packageSeed: packageSeed(3785, 'gallon milk'),
      purchases,
      isStaple: true,
    });
    expect(staple.source).toBe('learned');
    expect(staple.medianPurchaseQty).toBe(gal2);
    expect(staple.lowThresholdPct).toBe(0.2);
    expect(staple.lowThresholdPct).toBeLessThan(STAPLE_LOW_THRESHOLD_PCT);

    const nonStaple = computeParLevel({
      packageSeed: packageSeed(3785, 'gallon milk'),
      purchases,
      isStaple: false,
    });
    expect(nonStaple.lowThresholdPct).toBe(0.2);
  });
});

describe('seasonal gap constant', () => {
  it('is approximately 4 months', () => {
    expect(SEASONAL_GAP_MS / DAY).toBe(120);
  });
});

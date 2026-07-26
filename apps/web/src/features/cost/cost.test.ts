/**
 * Cost per meal — partial price data honesty.
 */

import { describe, expect, it } from 'vitest';

import {
  buildPriceIndex,
  completenessLabel,
  costCookEvent,
  formatUsd,
  mealCostTrend,
  mostExpensiveRecurring,
} from './meal-cost';
import type { PricedTxn } from './types';

function purchase(
  id: string,
  ingredientId: string,
  formId: string,
  deltaBase: number,
  unitPrice: number,
  occurredAt: string,
): PricedTxn {
  return {
    id,
    ingredientId,
    formId,
    reason: 'purchase',
    kind: 'relative',
    deltaBase,
    unitPrice,
    occurredAt,
  };
}

function cook(
  id: string,
  cookEventId: string,
  ingredientId: string,
  formId: string,
  deltaBase: number,
  occurredAt: string,
): PricedTxn {
  return {
    id,
    ingredientId,
    formId,
    reason: 'cook',
    kind: 'relative',
    deltaBase,
    refId: cookEventId,
    occurredAt,
  };
}

describe('completenessLabel', () => {
  it('describes partial coverage without false precision', () => {
    expect(completenessLabel(6, 9)).toBe(
      'estimated from 6 of 9 ingredients',
    );
    expect(completenessLabel(0, 3)).toBe(
      'No price data for any of 3 ingredients',
    );
    expect(completenessLabel(3, 3)).toBeNull();
  });
});

describe('costCookEvent with partial price data', () => {
  const txns: PricedTxn[] = [
    // flour: $4 for 1000 g → $0.004/g
    purchase('p1', 'flour', 'flour-ap', 1000, 4.0, '2026-07-01T00:00:00.000Z'),
    // butter: $5 for 454 g
    purchase('p2', 'butter', 'butter-stick', 454, 5.0, '2026-07-02T00:00:00.000Z'),
    // eggs: $3 for 12
    purchase('p3', 'egg', 'egg-whole', 12, 3.0, '2026-07-03T00:00:00.000Z'),
    // milk has NO purchase price
    // cook event uses 4 ingredients, milk unpriced
    cook('c1', 'cook_abc', 'flour', 'flour-ap', -250, '2026-07-10T18:00:00.000Z'),
    cook('c2', 'cook_abc', 'butter', 'butter-stick', -50, '2026-07-10T18:00:00.000Z'),
    cook('c3', 'cook_abc', 'egg', 'egg-whole', -2, '2026-07-10T18:00:00.000Z'),
    cook('c4', 'cook_abc', 'milk', 'milk-liquid', -200, '2026-07-10T18:00:00.000Z'),
  ];

  it('sums only priced lines and labels incompleteness', () => {
    const meal = costCookEvent(txns, 'cook_abc', 4);

    expect(meal.totalLineCount).toBe(4);
    expect(meal.pricedLineCount).toBe(3);
    expect(meal.complete).toBe(false);
    expect(meal.completenessLabel).toBe(
      'estimated from 3 of 4 ingredients',
    );

    // flour: 250 * 0.004 = 1.0
    // butter: 50 * (5/454) ≈ 0.55066
    // eggs: 2 * (3/12) = 0.5
    // milk: unpriced
    expect(meal.totalCost).not.toBeNull();
    const expected =
      250 * (4 / 1000) + 50 * (5 / 454) + 2 * (3 / 12);
    expect(meal.totalCost!).toBeCloseTo(expected, 5);
    expect(meal.perServing).toBeCloseTo(expected / 4, 5);

    const milkLine = meal.lines.find((l) => l.ingredientId === 'milk');
    expect(milkLine?.priced).toBe(false);
    expect(milkLine?.lineCost).toBeNull();
  });

  it('returns null total when nothing is priced', () => {
    const onlyCook: PricedTxn[] = [
      cook('c1', 'cook_x', 'mystery', 'f', -10, '2026-07-10T00:00:00.000Z'),
    ];
    const meal = costCookEvent(onlyCook, 'cook_x', 2);
    expect(meal.totalCost).toBeNull();
    expect(meal.perServing).toBeNull();
    expect(meal.completenessLabel).toMatch(/No price data/);
    expect(formatUsd(meal.totalCost)).toBe('—');
  });

  it('is complete when all cook ingredients have prices', () => {
    const full: PricedTxn[] = [
      purchase('p1', 'flour', 'flour-ap', 1000, 4.0, '2026-07-01T00:00:00.000Z'),
      cook('c1', 'cook_full', 'flour', 'flour-ap', -100, '2026-07-10T00:00:00.000Z'),
    ];
    const meal = costCookEvent(full, 'cook_full', 2);
    expect(meal.complete).toBe(true);
    expect(meal.completenessLabel).toBeNull();
    expect(meal.totalCost).toBeCloseTo(0.4, 5);
    expect(formatUsd(meal.totalCost)).toBe('$0.40');
  });
});

describe('buildPriceIndex', () => {
  it('uses latest purchase per ingredient+form', () => {
    const txns: PricedTxn[] = [
      purchase('p1', 'flour', 'f', 1000, 2.0, '2026-01-01T00:00:00.000Z'),
      purchase('p2', 'flour', 'f', 1000, 4.0, '2026-06-01T00:00:00.000Z'),
    ];
    const index = buildPriceIndex(txns);
    expect(index.get('flour::f')!.pricePerBase).toBeCloseTo(0.004, 6);
    expect(index.get('flour::f')!.purchaseTxnId).toBe('p2');
  });
});

describe('mealCostTrend + mostExpensiveRecurring', () => {
  const txns: PricedTxn[] = [
    purchase('p1', 'parmesan', 'parm', 100, 10.0, '2026-07-01T00:00:00.000Z'),
    purchase('p2', 'pasta', 'dry', 500, 2.0, '2026-07-01T00:00:00.000Z'),
    cook('c1', 'cook_1', 'parmesan', 'parm', -20, '2026-07-05T00:00:00.000Z'),
    cook('c2', 'cook_1', 'pasta', 'dry', -100, '2026-07-05T00:00:00.000Z'),
    cook('c3', 'cook_2', 'parmesan', 'parm', -30, '2026-07-12T00:00:00.000Z'),
    cook('c4', 'cook_2', 'pasta', 'dry', -100, '2026-07-12T00:00:00.000Z'),
  ];

  it('builds recent trend points', () => {
    const trend = mealCostTrend(txns, { defaultServings: 2 });
    expect(trend.length).toBe(2);
    expect(trend[0]!.cookEventId).toBe('cook_2'); // more recent first
    expect(trend.every((t) => t.totalCost != null)).toBe(true);
  });

  it('ranks expensive recurring ingredients', () => {
    const top = mostExpensiveRecurring(txns, { minCookCount: 2 });
    expect(top.length).toBeGreaterThan(0);
    // parmesan is pricier per gram
    expect(top[0]!.ingredientId).toBe('parmesan');
    expect(top[0]!.cookCount).toBe(2);
  });
});

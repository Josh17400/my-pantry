import { DEFAULT_STOCK_EPSILON } from '@larder/core';
import { describe, expect, it } from 'vitest';

import {
  buildDemoItems,
  buildItems,
  buildLiveItems,
  clampConsumeQty,
  defaultConsumeQtyBase,
  maxMultiplierForStock,
} from './derive-items';
import {
  defaultQuickPrefs,
  DEMO_PINS,
  DEMO_SUGGESTED_CATALOG,
  demoQuickPrefs,
} from './prefs';
import type { QuickPantryLine, QuickPrefs } from './types';

function line(
  partial: Partial<QuickPantryLine> &
    Pick<QuickPantryLine, 'ingredientId' | 'formId' | 'ingredientName' | 'qtyBase' | 'dim'>,
): QuickPantryLine {
  return {
    formName: null,
    updatedAt: '2026-07-01T00:00:00.000Z',
    ...partial,
  };
}

describe('quick-consume prefs', () => {
  it('default prefs are empty — no fabricated yogurt/apple/egg pins', () => {
    const prefs = defaultQuickPrefs();
    expect(prefs.pins).toEqual([]);
    expect(prefs.frequency).toEqual({});
    expect(prefs.recentClientTxnIds).toEqual([]);
  });

  it('demo prefs ship yogurt, apple, egg pins only for demo mode', () => {
    const prefs = demoQuickPrefs();
    const names = prefs.pins.map((p) => p.name.toLowerCase());
    expect(names).toContain('yogurt');
    expect(names).toContain('apple');
    expect(names).toContain('egg');
  });

  it('demo suggested catalog does not duplicate demo pins', () => {
    const pinned = new Set(DEMO_PINS.map((p) => p.ingredientId));
    for (const s of DEMO_SUGGESTED_CATALOG) {
      expect(pinned.has(s.ingredientId)).toBe(false);
    }
  });

  it('demo egg default qty is 1 count — stepper multiplies without extra taps for 1', () => {
    const egg = DEMO_PINS.find((p) => p.ingredientId === 'egg');
    expect(egg?.defaultQtyBase).toBe(1);
    expect(egg?.dim).toBe('count');
  });
});

describe('derive quick tiles from pantry (live)', () => {
  it('pantry holding only cucumber yields a cucumber tile and no yogurt/apple/egg', () => {
    const pantry: QuickPantryLine[] = [
      line({
        ingredientId: 'cucumber',
        formId: 'cucumber-each',
        ingredientName: 'Cucumber',
        qtyBase: 2,
        dim: 'count',
      }),
    ];
    const items = buildLiveItems({
      prefs: defaultQuickPrefs(),
      pantry,
    });

    expect(items.length).toBe(1);
    expect(items[0]!.ingredientId).toBe('cucumber');
    expect(items[0]!.consumable).toBe(true);
    expect(items.map((i) => i.ingredientId)).not.toContain('yogurt-plain');
    expect(items.map((i) => i.ingredientId)).not.toContain('apple');
    expect(items.map((i) => i.ingredientId)).not.toContain('egg');
  });

  it('empty pantry yields zero tiles in live mode', () => {
    const items = buildLiveItems({
      prefs: defaultQuickPrefs(),
      pantry: [],
    });
    expect(items).toEqual([]);

    // Even with leftover demo-shaped pins in prefs, out-of-stock pins are hidden.
    const withGhostPins: QuickPrefs = {
      pins: DEMO_PINS.map((p) => ({ ...p })),
      frequency: { egg: 99 },
      recentClientTxnIds: [],
    };
    const stillEmpty = buildLiveItems({
      prefs: withGhostPins,
      pantry: [],
    });
    expect(stillEmpty).toEqual([]);
  });

  it('ingredient at zero stock produces no consumable tile', () => {
    const pantry: QuickPantryLine[] = [
      line({
        ingredientId: 'egg',
        formId: 'egg-whole',
        ingredientName: 'Egg',
        qtyBase: 0,
        dim: 'count',
      }),
      line({
        ingredientId: 'apple',
        formId: 'apple-each',
        ingredientName: 'Apple',
        // Float residue below epsilon must not count as stocked
        qtyBase: DEFAULT_STOCK_EPSILON,
        dim: 'count',
      }),
      line({
        ingredientId: 'banana',
        formId: 'banana-each',
        ingredientName: 'Banana',
        qtyBase: DEFAULT_STOCK_EPSILON / 10,
        dim: 'count',
      }),
    ];
    const items = buildLiveItems({
      prefs: defaultQuickPrefs(),
      pantry,
    });
    expect(items.filter((i) => i.consumable)).toHaveLength(0);
    expect(items).toHaveLength(0);
  });

  it('ranking follows recorded quick-consume frequency, not a seeded constant', () => {
    const pantry: QuickPantryLine[] = [
      line({
        ingredientId: 'banana',
        formId: 'banana-each',
        ingredientName: 'Banana',
        qtyBase: 5,
        dim: 'count',
        updatedAt: '2026-07-10T00:00:00.000Z',
      }),
      line({
        ingredientId: 'apple',
        formId: 'apple-each',
        ingredientName: 'Apple',
        qtyBase: 3,
        dim: 'count',
        updatedAt: '2026-07-20T00:00:00.000Z',
      }),
      line({
        ingredientId: 'carrot',
        formId: 'carrot-bulk',
        ingredientName: 'Carrot',
        qtyBase: 200,
        dim: 'mass',
        updatedAt: '2026-07-25T00:00:00.000Z',
      }),
    ];
    const prefs: QuickPrefs = {
      pins: [],
      // Real history: banana eaten often; apple rarely; carrot never.
      // Seeded demo had egg:15 > apple:8 > banana:6 — must NOT apply here.
      frequency: {
        banana: 10,
        apple: 2,
      },
      recentClientTxnIds: [],
    };

    const items = buildLiveItems({ prefs, pantry });
    expect(items.map((i) => i.ingredientId)).toEqual([
      'banana',
      'apple',
      'carrot',
    ]);

    // Tie on frequency → most recently updated wins
    const tied: QuickPrefs = {
      pins: [],
      frequency: { banana: 3, apple: 3 },
      recentClientTxnIds: [],
    };
    const tiedItems = buildLiveItems({ prefs: tied, pantry });
    const ids = tiedItems.map((i) => i.ingredientId);
    // apple updated later than banana; carrot has 0 frequency so last
    expect(ids.indexOf('apple')).toBeLessThan(ids.indexOf('banana'));
    expect(ids.indexOf('banana')).toBeLessThan(ids.indexOf('carrot'));
  });

  it('suggested consume amount never exceeds stock on hand', () => {
    const pantry: QuickPantryLine[] = [
      line({
        ingredientId: 'egg',
        formId: 'egg-whole',
        ingredientName: 'Egg',
        qtyBase: 2,
        dim: 'count',
      }),
      line({
        ingredientId: 'yogurt-plain',
        formId: 'yogurt-plain-bulk',
        ingredientName: 'Yogurt',
        qtyBase: 80, // less than default 170 g cup
        dim: 'mass',
      }),
    ];
    const items = buildLiveItems({
      prefs: defaultQuickPrefs(),
      pantry,
    });

    for (const item of items) {
      expect(item.defaultQtyBase).toBeLessThanOrEqual(item.stockQtyBase);
      expect(item.defaultQtyBase).toBeGreaterThan(0);
    }

    const egg = items.find((i) => i.ingredientId === 'egg');
    expect(egg?.defaultQtyBase).toBe(1);
    expect(maxMultiplierForStock(egg!.defaultQtyBase, egg!.stockQtyBase)).toBe(
      2,
    );

    const yogurt = items.find((i) => i.ingredientId === 'yogurt-plain');
    expect(yogurt?.defaultQtyBase).toBe(80);
    expect(
      clampConsumeQty(yogurt!.defaultQtyBase * 3, yogurt!.stockQtyBase),
    ).toBe(80);
  });

  it('pinned in-stock item appears as pinned; out-of-stock pin is hidden', () => {
    const prefs: QuickPrefs = {
      pins: [
        {
          ingredientId: 'egg',
          formId: 'egg-whole',
          name: 'Egg',
          defaultQtyBase: 1,
          dim: 'count',
        },
        {
          ingredientId: 'apple',
          formId: 'apple-each',
          name: 'Apple',
          defaultQtyBase: 1,
          dim: 'count',
        },
      ],
      frequency: {},
      recentClientTxnIds: [],
    };
    const pantry: QuickPantryLine[] = [
      line({
        ingredientId: 'egg',
        formId: 'egg-whole',
        ingredientName: 'Egg',
        qtyBase: 6,
        dim: 'count',
      }),
      // apple pin exists but no pantry line / zero stock → hidden
    ];
    const items = buildLiveItems({ prefs, pantry });
    expect(items).toHaveLength(1);
    expect(items[0]!.ingredientId).toBe('egg');
    expect(items[0]!.origin).toBe('pinned');
    expect(items[0]!.consumable).toBe(true);
  });
});

describe('buildItems mode switch', () => {
  it('demo mode returns demo catalog even with empty pantry', () => {
    const items = buildItems('demo', demoQuickPrefs(), []);
    const ids = items.map((i) => i.ingredientId);
    expect(ids).toContain('yogurt-plain');
    expect(ids).toContain('apple');
    expect(ids).toContain('egg');
    expect(ids).toContain('banana');
  });

  it('live mode never returns demo catalog for empty pantry', () => {
    const items = buildItems('live', defaultQuickPrefs(), []);
    expect(items).toEqual([]);
    // demoQuickPrefs pins must not leak into live with empty stock
    const withDemoPrefs = buildItems('live', demoQuickPrefs(), []);
    expect(withDemoPrefs).toEqual([]);
  });

  it('buildDemoItems marks every tile consumable', () => {
    const items = buildDemoItems();
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => i.consumable)).toBe(true);
  });
});

describe('default consume qty helpers', () => {
  it('count defaults to 1 capped by stock', () => {
    expect(defaultConsumeQtyBase('count', 5)).toBe(1);
    expect(defaultConsumeQtyBase('count', 0.5)).toBe(0.5);
    expect(defaultConsumeQtyBase('count', 0)).toBe(0);
  });

  it('mass defaults to 170 g when stock allows', () => {
    expect(defaultConsumeQtyBase('mass', 500)).toBe(170);
    expect(defaultConsumeQtyBase('mass', 100)).toBe(100);
  });

  it('clamp and max multiplier guard against overshoot', () => {
    expect(clampConsumeQty(3, 2)).toBe(2);
    expect(clampConsumeQty(1, 0)).toBe(0);
    expect(maxMultiplierForStock(1, 3)).toBe(3);
    expect(maxMultiplierForStock(170, 80)).toBe(1);
  });
});

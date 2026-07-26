import { describe, expect, it } from 'vitest';

import { resolveStockUi } from './stock-display';

const NOW = Date.parse('2026-07-26T12:00:00.000Z');

describe('resolveStockUi', () => {
  it('maps out / low / ok', () => {
    expect(
      resolveStockUi(
        { qtyBase: 0, parLevelBase: 100, lowThresholdPct: 0.25 },
        NOW,
      ).stockStatus,
    ).toBe('out');

    expect(
      resolveStockUi(
        { qtyBase: 20, parLevelBase: 100, lowThresholdPct: 0.25 },
        NOW,
      ).stockStatus,
    ).toBe('low');

    expect(
      resolveStockUi(
        { qtyBase: 80, parLevelBase: 100, lowThresholdPct: 0.25 },
        NOW,
      ).label,
    ).toBe('Plenty');
  });

  it('surfaces near expiry on ok stock', () => {
    const ui = resolveStockUi(
      {
        qtyBase: 80,
        parLevelBase: 100,
        lowThresholdPct: 0.25,
        expiresAt: new Date(NOW + 2 * 86400000).toISOString(),
      },
      NOW,
    );
    expect(ui.band).toBe('critical');
    expect(ui.label).toMatch(/day/);
  });
});

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOW_THRESHOLD_PCT,
  DEFAULT_STOCK_EPSILON,
  evaluateStock,
  evaluateStockBatch,
  negativeStockSignal,
  wouldGoNegative,
} from '../../src/pantry';

describe('evaluateStock boundaries', () => {
  const par = 1000;

  it('OUT at zero and at epsilon', () => {
    expect(evaluateStock(0, par).status).toBe('out');
    expect(evaluateStock(DEFAULT_STOCK_EPSILON, par).status).toBe('out');
  });

  it('LOW exactly at threshold', () => {
    const thr = DEFAULT_LOW_THRESHOLD_PCT;
    const at = par * thr;
    expect(evaluateStock(at, par, { lowThresholdPct: thr }).status).toBe('low');
    expect(
      evaluateStock(at + 0.1, par, { lowThresholdPct: thr }).status,
    ).toBe('ok');
    expect(
      evaluateStock(at - 0.1, par, { lowThresholdPct: thr }).status,
    ).toBe('low');
  });

  it('below zero is negative (not clamped) with prompt signal', () => {
    const r = evaluateStock(-12, par);
    expect(r.status).toBe('negative');
    expect(r.qtyBase).toBe(-12);
    expect(r.needsNegativePrompt).toBe(true);

    const sig = negativeStockSignal(50, 80);
    expect(sig).not.toBeNull();
    expect(sig!.projectedBase).toBe(-30);
    expect(sig!.prompt).toBe('still_have_some');

    expect(wouldGoNegative(50, 80)).toBe(true);
    expect(wouldGoNegative(50, 40)).toBe(false);
  });

  it('OK when comfortably above threshold', () => {
    expect(evaluateStock(500, par).status).toBe('ok');
  });
});

describe('evaluateStockBatch — daily brief, not per-item push', () => {
  it('returns everything low/out/negative in one brief', () => {
    const brief = evaluateStockBatch([
      { key: 'flour', qtyBase: 100, parLevelBase: 1000 }, // low
      { key: 'milk', qtyBase: 0, parLevelBase: 2000 }, // out
      { key: 'eggs', qtyBase: 12, parLevelBase: 12 }, // ok (100%)
      { key: 'butter', qtyBase: -5, parLevelBase: 100 }, // negative
      { key: 'rice', qtyBase: 800, parLevelBase: 1000 }, // ok
    ]);

    expect(brief.low.map((x) => x.key)).toEqual(['flour']);
    expect(brief.out.map((x) => x.key)).toEqual(['milk']);
    expect(brief.negative.map((x) => x.key)).toEqual(['butter']);
    expect(brief.brief.map((x) => x.key)).toEqual([
      'butter',
      'milk',
      'flour',
    ]);
  });

  it('empty pantry → empty brief', () => {
    const b = evaluateStockBatch([]);
    expect(b.brief).toEqual([]);
  });

  /**
   * Reported from a real device: an item showing "0 mg" and "Plenty" at once,
   * absent from the grocery list, and unfixable by the projection repair
   * (because the cache genuinely matched the ledger — nothing was corrupted).
   *
   * Cause: removing everything left a float residue from pound<->gram
   * conversion. With epsilon at 1e-9 the residue was not OUT, and with no par
   * level it could not be LOW, so it fell through to OK -> "Plenty".
   */
  describe('float residue must not read as stocked', () => {
    const RESIDUE = 1e-7; // ~ what lb -> g -> lb round-tripping leaves behind

    it('residue with NO par level is out, not ok', () => {
      const e = evaluateStock(RESIDUE, 0);
      expect(e.status).toBe('out');
    });

    it('residue with a par level is out, not low or ok', () => {
      expect(evaluateStock(RESIDUE, 900).status).toBe('out');
    });

    it('a real small amount is still counted, not swallowed', () => {
      // 1 g of saffron is a genuine quantity and must not be treated as zero.
      expect(evaluateStock(1, 0).status).not.toBe('out');
      expect(evaluateStock(1, 900).status).toBe('low');
    });

    it('exact zero and negative are unchanged', () => {
      expect(evaluateStock(0, 900).status).toBe('out');
      expect(evaluateStock(-5, 900).status).toBe('negative');
    });

    it('residue reaches the shopping brief as out-of-stock', () => {
      const b = evaluateStockBatch([
        { key: 'chicken', qtyBase: RESIDUE, parLevelBase: 0 },
      ]);
      expect(b.out.map((x) => x.key)).toContain('chicken');
    });
  });
});

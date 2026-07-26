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
});

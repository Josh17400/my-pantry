import { describe, expect, it } from 'vitest';

import { parseHumanDelta, parseHumanQuantity } from './qty-input';

describe('parseHumanQuantity', () => {
  it('parses mass to grams base', () => {
    const r = parseHumanQuantity('2 lb', 'mass');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dim).toBe('mass');
      expect(r.qtyBase).toBeCloseTo(2 * 453.59237, 1);
    }
  });

  it('rejects dimension mismatch', () => {
    const r = parseHumanQuantity('1 cup', 'mass');
    expect(r.ok).toBe(false);
  });

  it('bare number uses preferred dim as base', () => {
    const r = parseHumanQuantity('12', 'count');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.qtyBase).toBe(12);
  });
});

describe('parseHumanDelta', () => {
  it('honors leading minus', () => {
    const r = parseHumanDelta('-100 g', 'mass');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.qtyBase).toBe(-100);
  });

  it('honors leading plus', () => {
    const r = parseHumanDelta('+2 oz', 'mass');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.qtyBase).toBeGreaterThan(0);
  });
});

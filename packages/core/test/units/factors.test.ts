import { describe, expect, it } from 'vitest';
import {
  EXACT,
  convert,
  convertToBase,
  dimensionOf,
  resolveUnitId,
  toBaseFactor,
} from '../../src/units';

/** Floating tolerance for round-trip checks (definition-level precision). */
const EPS = 1e-9;

describe('US customary factor table', () => {
  it('1 cup = 236.5882365 ml (US customary cup = 1/16 gal)', () => {
    expect(toBaseFactor('cup')).toBe(EXACT.CUP_TO_ML);
    expect(EXACT.CUP_TO_ML).toBeCloseTo(236.588, 3);
    const r = convert({ value: 1, fromUnit: 'cup', toUnit: 'ml' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(236.5882365);
      expect(r.dim).toBe('volume');
      expect(r.uncertaintyPct).toBe(0);
    }
  });

  it('1 lb = 453.59237 g (International yard and pound agreement)', () => {
    expect(toBaseFactor('lb')).toBe(EXACT.LB_TO_G);
    const r = convert({ value: 1, fromUnit: 'lb', toUnit: 'g' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(453.59237);
  });

  it('1 tbsp = 3 tsp exactly (US culinary identity)', () => {
    const r = convert({ value: 1, fromUnit: 'tbsp', toUnit: 'tsp' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBeCloseTo(EXACT.TSP_PER_TBSP, 12);
      expect(Math.abs(r.value - 3)).toBeLessThan(EPS);
    }
  });

  it('1 cup = 16 tbsp = 48 tsp', () => {
    const toTbsp = convert({ value: 1, fromUnit: 'cup', toUnit: 'tbsp' });
    const toTsp = convert({ value: 1, fromUnit: 'cup', toUnit: 'tsp' });
    expect(toTbsp.ok && toTbsp.value).toBeCloseTo(16, 10);
    expect(toTsp.ok && toTsp.value).toBeCloseTo(48, 10);
  });

  it('1 fl oz = 2 tbsp', () => {
    const r = convert({ value: 1, fromUnit: 'fl oz', toUnit: 'tbsp' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(2, 12);
  });

  it('1 dozen = 12 each', () => {
    const r = convert({ value: 1, fromUnit: 'dozen', toUnit: 'each' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(12);
  });
});

describe('round-trips within each dimension', () => {
  const cases: { from: string; to: string; value: number }[] = [
    { from: 'g', to: 'lb', value: 1000 },
    { from: 'lb', to: 'oz', value: 2.5 },
    { from: 'kg', to: 'mg', value: 0.5 },
    { from: 'ml', to: 'cup', value: 500 },
    { from: 'gallon', to: 'tsp', value: 0.25 },
    { from: 'pint', to: 'fl oz', value: 1 },
    { from: 'each', to: 'dozen', value: 24 },
  ];

  for (const { from, to, value } of cases) {
    it(`${value} ${from} → ${to} → ${from} is lossless within EPS`, () => {
      const out = convert({ value, fromUnit: from, toUnit: to });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      const back = convert({ value: out.value, fromUnit: to, toUnit: from });
      expect(back.ok).toBe(true);
      if (!back.ok) return;
      expect(Math.abs(back.value - value)).toBeLessThan(EPS * Math.max(1, Math.abs(value)));
    });
  }
});

describe('resolveUnitId / dimensionOf', () => {
  it('resolves common aliases', () => {
    expect(resolveUnitId('cups')).toBe('cup');
    expect(resolveUnitId('Tablespoons')).toBe('tbsp');
    expect(resolveUnitId('fl. oz')).toBe('fl oz');
    expect(resolveUnitId('lbs')).toBe('lb');
    expect(resolveUnitId('cloves')).toBe('each');
  });

  it('maps units to dimensions', () => {
    expect(dimensionOf('cup')).toBe('volume');
    expect(dimensionOf('lb')).toBe('mass');
    expect(dimensionOf('dozen')).toBe('count');
    expect(dimensionOf('furlong')).toBeUndefined();
  });

  it('convertToBase stores mass in g', () => {
    const r = convertToBase(2, 'lb');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.dim).toBe('mass');
      expect(r.value).toBeCloseTo(2 * EXACT.LB_TO_G, 10);
    }
  });
});

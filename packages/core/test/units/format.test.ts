import { describe, expect, it } from 'vitest';
import {
  EXACT,
  decimalsForUncertainty,
  formatQuantity,
} from '../../src/units';

describe('formatQuantity — US retail defaults', () => {
  it('1134 g → roughly "2.5 lb"', () => {
    // 1134 / 453.59237 ≈ 2.500 approx
    const g = 2.5 * EXACT.LB_TO_G;
    const s = formatQuantity(g, 'mass', { uncertaintyPct: 0 });
    expect(s).toMatch(/2\.5\s*lb/);
  });

  it('473 ml → roughly "2 cups"', () => {
    // 2 cups = 473.176473 ml
    const ml = 2 * EXACT.CUP_TO_ML;
    const s = formatQuantity(ml, 'volume', { uncertaintyPct: 0 });
    expect(s).toMatch(/2\s*cups?/);
  });

  it('preferredUnit forces unit', () => {
    const s = formatQuantity(1000, 'mass', { preferredUnit: 'kg' });
    expect(s).toMatch(/1\s*kg/);
  });

  it('metric locale prefers g/kg and ml/l', () => {
    const s = formatQuantity(1500, 'mass', { locale: 'metric' });
    expect(s).toMatch(/1\.5\s*kg/);
  });

  it('count: 24 each → dozen when clean', () => {
    const s = formatQuantity(24, 'count');
    expect(s).toMatch(/2\s*dozen/);
  });
});

describe('formatQuantity — never more precision than uncertainty justifies', () => {
  it('decimalsForUncertainty shrinks with larger uncertainty', () => {
    // value 100, 10% unc → abs 10 → order 1 → 0 decimals
    expect(decimalsForUncertainty(100, 10, 3)).toBe(0);
    // value 100, 0.1% unc → abs 0.1 → order -1 → 1 decimal
    expect(decimalsForUncertainty(100, 0.1, 3)).toBe(1);
    // value 1, 50% → abs 0.5 → order -1 → 1 decimal (not 3)
    expect(decimalsForUncertainty(1, 50, 3)).toBeLessThanOrEqual(1);
  });

  it('high uncertainty strips decimal noise from display', () => {
    // 113.456 g with 20% uncertainty should not show three decimals
    const s = formatQuantity(113.456, 'mass', {
      uncertaintyPct: 20,
      preferredUnit: 'g',
      maxDecimals: 3,
    });
    // "113 g" or "110 g" style — no thousandths
    expect(s).not.toMatch(/\.\d{2,}/);
    expect(s).toMatch(/g/);
  });

  it('zero uncertainty may show limited decimals but still readable', () => {
    const s = formatQuantity(1.5 * EXACT.CUP_TO_ML, 'volume', {
      uncertaintyPct: 0,
      preferredUnit: 'cup',
    });
    expect(s).toMatch(/1\.5\s*cups?/);
  });

  it('non-finite base → em dash', () => {
    expect(formatQuantity(NaN, 'mass')).toBe('—');
  });
});

import { convertToBase } from '@larder/core';
import { describe, expect, it } from 'vitest';

import {
  formatPickerPreview,
  nearestStep,
  pickDefaultUnit,
  quantityStepsForUnit,
  rescaleQuantityForUnitChange,
  resolvePickerOutcome,
  seedPickerSelection,
  unitMatchesDimension,
  unitsForDimension,
  wheelCountForMode,
} from './picker-wheels';
import { buildAdjustTxn, buildRecountTxn } from './txn-builders';

describe('unitsForDimension', () => {
  it('mass offers g, kg, oz, lb only', () => {
    expect([...unitsForDimension('mass')]).toEqual(['g', 'kg', 'oz', 'lb']);
  });

  it('volume offers ml, l, tsp, tbsp, cup, fl oz', () => {
    expect([...unitsForDimension('volume')]).toEqual([
      'ml',
      'l',
      'tsp',
      'tbsp',
      'cup',
      'fl oz',
    ]);
  });

  it('count offers each and dozen', () => {
    expect([...unitsForDimension('count')]).toEqual(['each', 'dozen']);
  });

  it('rejects cross-dimension units (lbs for eggs)', () => {
    expect(unitMatchesDimension('lb', 'count')).toBe(false);
    expect(unitMatchesDimension('each', 'mass')).toBe(false);
    expect(unitMatchesDimension('cup', 'mass')).toBe(false);
  });
});

describe('quantityStepsForUnit', () => {
  it('g/ml: step 1 to 100, then 5, then 25', () => {
    const steps = quantityStepsForUnit('g');
    expect(steps[0]).toBe(0);
    expect(steps).toContain(1);
    expect(steps).toContain(100);
    // after 100, 5-steps
    expect(steps).toContain(105);
    expect(steps).toContain(500);
    // then 25-steps
    expect(steps).toContain(525);
    expect(steps).toContain(1000);

    const idx100 = steps.indexOf(100);
    const idx105 = steps.indexOf(105);
    expect(idx105).toBe(idx100 + 1);
    expect(steps[idx105]! - steps[idx100]!).toBe(5);

    const idx500 = steps.indexOf(500);
    const after500 = steps[idx500 + 1]!;
    expect(after500 - 500).toBe(25);
  });

  it('kg/l: 0.05 up to 2, then 0.25', () => {
    const steps = quantityStepsForUnit('kg');
    expect(steps).toContain(0);
    expect(steps).toContain(0.05);
    expect(steps).toContain(2);
    expect(steps).toContain(2.25);
    const i2 = steps.indexOf(2);
    expect(steps[i2 + 1]).toBeCloseTo(2.25, 5);
  });

  it('oz / fl oz step 0.5', () => {
    const oz = quantityStepsForUnit('oz');
    expect(oz).toContain(0.5);
    expect(oz).toContain(1);
    const i0 = oz.indexOf(0);
    expect(oz[i0 + 1]! - oz[i0]!).toBeCloseTo(0.5, 5);
  });

  it('lb step 0.25', () => {
    const lb = quantityStepsForUnit('lb');
    expect(lb).toContain(0.25);
    expect(lb).toContain(1);
    const i0 = lb.indexOf(0);
    expect(lb[i0 + 1]! - lb[i0]!).toBeCloseTo(0.25, 5);
  });

  it('count step 1', () => {
    const each = quantityStepsForUnit('each');
    expect(each.slice(0, 5)).toEqual([0, 1, 2, 3, 4]);
  });

  it('cups include cooking fractions', () => {
    const cups = quantityStepsForUnit('cup');
    expect(cups).toContain(0.25);
    expect(cups.some((v) => Math.abs(v - 1 / 3) < 1e-6)).toBe(true);
    expect(cups).toContain(0.5);
    expect(cups.some((v) => Math.abs(v - 2 / 3) < 1e-6)).toBe(true);
    expect(cups).toContain(0.75);
    expect(cups).toContain(1);
  });
});

describe('rescaleQuantityForUnitChange', () => {
  it('preserves equivalent amount when changing unit (2 lb → ≈907 g)', () => {
    const r = rescaleQuantityForUnitChange(2, 'lb', 'g');
    expect(r.ok).toBe(true);
    // 2 lb = 907.18474 g → nearest step in 25g band (900 or 925)
    expect(r.qty).toBeGreaterThanOrEqual(900);
    expect(r.qty).toBeLessThanOrEqual(925);
    // Still non-zero and within ~3% of true grams
    expect(Math.abs(r.qty - 907.18) / 907.18).toBeLessThan(0.03);
    // Round-trip still close in display pounds
    const back = rescaleQuantityForUnitChange(r.qty, 'g', 'lb');
    expect(back.ok).toBe(true);
    expect(back.qty).toBeCloseTo(2, 0);
  });

  it('does not reset to zero on unit change', () => {
    const r = rescaleQuantityForUnitChange(500, 'g', 'oz');
    expect(r.ok).toBe(true);
    expect(r.qty).toBeGreaterThan(0);
  });
});

describe('seedPickerSelection', () => {
  it('Adjust starts at zero', () => {
    const s = seedPickerSelection('adjust', 'mass', 1814);
    expect(s.qty).toBe(0);
  });

  it('Recount seeds from current quantity', () => {
    const twoLbBase = convertToBase(2, 'lb');
    expect(twoLbBase.ok).toBe(true);
    if (!twoLbBase.ok) return;
    const s = seedPickerSelection('recount', 'mass', twoLbBase.value, 'lb');
    expect(s.unit).toBe('lb');
    expect(s.qty).toBeCloseTo(2, 0);
  });
});

describe('resolvePickerOutcome + ledger distinction', () => {
  const item = { ingredientId: 'flour', formId: 'flour-ap' };

  it('adjust produces a relative txn; recount an absolute one', () => {
    const adj = resolvePickerOutcome(
      { qty: 100, unit: 'g', direction: 'remove' },
      'adjust',
      500,
    );
    expect(adj.ok).toBe(true);
    if (!adj.ok) return;
    expect(adj.outcome.qtyBase).toBe(-100);
    expect(adj.outcome.resultQtyBase).toBe(400);

    const adjTxn = buildAdjustTxn(item, adj.outcome.qtyBase);
    expect(adjTxn.kind).toBe('relative');
    if (adjTxn.kind === 'relative') {
      expect(adjTxn.reason).toBe('adjust_delta');
      expect(adjTxn.deltaBase).toBe(-100);
    }

    const rc = resolvePickerOutcome(
      { qty: 2, unit: 'lb', direction: 'add' },
      'recount',
      1814,
    );
    expect(rc.ok).toBe(true);
    if (!rc.ok) return;
    expect(rc.outcome.qtyBase).toBeCloseTo(2 * 453.59237, 1);
    expect(rc.outcome.resultQtyBase).toBe(rc.outcome.qtyBase);

    const rcTxn = buildRecountTxn(item, rc.outcome.qtyBase);
    expect(rcTxn.kind).toBe('absolute');
    if (rcTxn.kind === 'absolute') {
      expect(rcTxn.reason).toBe('recount');
      expect(rcTxn.targetBase).toBe(rc.outcome.qtyBase);
    }
  });

  it('resulting quantity matches the preview for adjust', () => {
    const selection = {
      qty: 2,
      unit: 'lb' as const,
      direction: 'remove' as const,
    };
    const current = convertToBase(4, 'lb');
    expect(current.ok).toBe(true);
    if (!current.ok) return;

    const outcome = resolvePickerOutcome(selection, 'adjust', current.value);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.outcome.resultQtyBase).toBeCloseTo(convertToBase(2, 'lb').ok
      ? (convertToBase(2, 'lb') as { ok: true; value: number }).value
      : 0, 1);

    const preview = formatPickerPreview(
      'Flour',
      'adjust',
      'mass',
      selection,
      current.value,
    );
    // "Flour: 4 lb → 2 lb"
    expect(preview).toMatch(/Flour:/);
    expect(preview).toMatch(/4\s*lb/);
    expect(preview).toMatch(/2\s*lb/);
    expect(preview).toContain('→');
  });

  it('recount preview is a set-to statement', () => {
    const selection = { qty: 2, unit: 'lb', direction: 'add' as const };
    const preview = formatPickerPreview(
      'Flour',
      'recount',
      'mass',
      selection,
      1814,
    );
    expect(preview).toMatch(/will be set to/i);
    expect(preview).toMatch(/2\s*lb/);
    expect(preview).not.toContain('→');
  });

  it('waste is always a positive removal amount', () => {
    const w = resolvePickerOutcome(
      { qty: 50, unit: 'g', direction: 'add' },
      'waste',
      200,
    );
    expect(w.ok).toBe(true);
    if (!w.ok) return;
    expect(w.outcome.qtyBase).toBe(50);
    expect(w.outcome.resultQtyBase).toBe(150);
    expect(w.outcome.direction).toBe('remove');
  });
});

describe('wheelCountForMode', () => {
  it('Adjust has three wheels; Recount has two', () => {
    expect(wheelCountForMode('adjust')).toBe(3);
    expect(wheelCountForMode('recount')).toBe(2);
    expect(wheelCountForMode('waste')).toBe(2);
    expect(wheelCountForMode('add')).toBe(2);
  });
});

describe('nearestStep / pickDefaultUnit', () => {
  it('nearestStep snaps to table', () => {
    const steps = quantityStepsForUnit('lb');
    expect(nearestStep(1.1, steps)).toBeCloseTo(1, 5);
    expect(nearestStep(1.2, steps)).toBeCloseTo(1.25, 5);
  });

  it('pickDefaultUnit prefers readable unit for stocked amount', () => {
    const twoLb = convertToBase(2, 'lb');
    expect(twoLb.ok).toBe(true);
    if (!twoLb.ok) return;
    const u = pickDefaultUnit(twoLb.value, 'mass');
    expect(['lb', 'oz', 'kg', 'g']).toContain(u);
    // 2 lb should prefer lb over g
    expect(u).toBe('lb');
  });
});

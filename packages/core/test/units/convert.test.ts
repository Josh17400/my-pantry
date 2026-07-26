import { describe, expect, it } from 'vitest';

import {
  type ConversionEdge,
  convert,
  type IngredientForm,
} from '../../src/units';

const parmesanGrated: IngredientForm = {
  id: 'parmesan-grated',
  ingredientId: 'parmesan',
  form: 'grated',
  dim: 'volume',
  densityGPerMl: 0.38,
  uncertaintyPct: 15,
};

const eggWhole: IngredientForm = {
  id: 'egg-whole',
  ingredientId: 'egg',
  form: 'whole',
  dim: 'count',
  gramsPerCount: 50,
  uncertaintyPct: 10,
};

describe('density path (volume ↔ mass)', () => {
  it('1 cup grated parmesan ≈ 90 g at 0.38 g/ml', () => {
    // 1 cup = 236.5882365 ml; * 0.38 = 89.90352987 g
    const r = convert({
      value: 1,
      fromUnit: 'cup',
      toUnit: 'g',
      form: parmesanGrated,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const expectedMl = 236.5882365;
    const expectedG = expectedMl * 0.38;
    expect(r.value).toBeCloseTo(expectedG, 10);
    expect(r.value).toBeCloseTo(90, 0); // ~90 g as the brief states
    expect(r.dim).toBe('mass');
    expect(r.uncertaintyPct).toBe(15);
    expect(r.path).toContain('density:parmesan-grated');
  });

  it('mass → volume reverse via same density', () => {
    const g = 236.5882365 * 0.38;
    const r = convert({
      value: g,
      fromUnit: 'g',
      toUnit: 'cup',
      form: parmesanGrated,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBeCloseTo(1, 10);
  });
});

describe('count path via gramsPerCount', () => {
  it('3 eggs → grams', () => {
    const r = convert({
      value: 3,
      fromUnit: 'each',
      toUnit: 'g',
      form: eggWhole,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(150);
    expect(r.uncertaintyPct).toBe(10);
    expect(r.path).toContain('count-mass:egg-whole');
  });

  it('100 g → egg count', () => {
    const r = convert({
      value: 100,
      fromUnit: 'g',
      toUnit: 'each',
      form: eggWhole,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe(2);
  });
});

describe('unconvertible pairs never approximate (headline)', () => {
  it('volume → mass without form/density returns ok:false', () => {
    const r = convert({ value: 1, fromUnit: 'cup', toUnit: 'g' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('no-path');
      expect(r.detail.length).toBeGreaterThan(0);
    }
  });

  it('count → volume without bridge returns ok:false', () => {
    const form: IngredientForm = {
      id: 'widget',
      ingredientId: 'widget',
      form: 'whole',
      dim: 'count',
      uncertaintyPct: 5,
      // no gramsPerCount, no density
    };
    const r = convert({
      value: 2,
      fromUnit: 'each',
      toUnit: 'ml',
      form,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('no-path');
  });

  it('unknown unit returns unknown-unit', () => {
    const r = convert({ value: 1, fromUnit: 'smoot', toUnit: 'g' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unknown-unit');
  });

  it('unknown form id returns unknown-form', () => {
    const r = convert({
      value: 1,
      fromUnit: 'g',
      toUnit: 'g',
      fromFormId: 'a',
      toFormId: 'b',
      forms: [],
      edges: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unknown-form');
  });

  it('non-finite value returns non-finite', () => {
    const r = convert({ value: NaN, fromUnit: 'g', toUnit: 'lb' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('non-finite');
  });

  it('Infinity is rejected', () => {
    const r = convert({ value: Infinity, fromUnit: 'g', toUnit: 'lb' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('non-finite');
  });

  it('missing edge between forms returns no-path — never guesses', () => {
    const clove: IngredientForm = {
      id: 'garlic-clove',
      ingredientId: 'garlic',
      form: 'clove',
      dim: 'count',
      gramsPerCount: 3,
      uncertaintyPct: 20,
    };
    const powder: IngredientForm = {
      id: 'garlic-powder',
      ingredientId: 'garlic',
      form: 'powder',
      dim: 'volume',
      densityGPerMl: 0.5,
      uncertaintyPct: 25,
    };
    const r = convert({
      value: 3,
      fromUnit: 'each',
      toUnit: 'tsp',
      fromFormId: clove.id,
      toFormId: powder.id,
      forms: [clove, powder],
      edges: [], // no edge declared
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('no-path');
      // Must not invent a conversion
      expect(r).not.toHaveProperty('value');
    }
  });
});

describe('same-dimension needs no form', () => {
  it('g ↔ lb without form', () => {
    const r = convert({ value: 453.59237, fromUnit: 'g', toUnit: 'lb' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBeCloseTo(1, 12);
      expect(r.path).toEqual([]);
      expect(r.uncertaintyPct).toBe(0);
    }
  });
});

describe('multi-hop uncertainty > single-hop', () => {
  const forms: IngredientForm[] = [
    {
      id: 'A',
      ingredientId: 'x',
      form: 'a',
      dim: 'mass',
      uncertaintyPct: 0,
    },
    {
      id: 'B',
      ingredientId: 'x',
      form: 'b',
      dim: 'mass',
      uncertaintyPct: 0,
    },
    {
      id: 'C',
      ingredientId: 'x',
      form: 'c',
      dim: 'mass',
      uncertaintyPct: 0,
    },
  ];

  const direct: ConversionEdge = {
    fromFormId: 'A',
    toFormId: 'C',
    factor: 2,
    uncertaintyPct: 5,
    source: 'direct',
  };

  const hop1: ConversionEdge = {
    fromFormId: 'A',
    toFormId: 'B',
    factor: 2,
    uncertaintyPct: 4,
    source: 'ab',
  };
  const hop2: ConversionEdge = {
    fromFormId: 'B',
    toFormId: 'C',
    factor: 1,
    uncertaintyPct: 3,
    source: 'bc',
  };

  it('single-hop uses direct edge uncertainty only', () => {
    const r = convert({
      value: 10,
      fromUnit: 'g',
      toUnit: 'g',
      fromFormId: 'A',
      toFormId: 'C',
      forms,
      edges: [direct],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(20);
    expect(r.uncertaintyPct).toBe(5);
    expect(r.path).toEqual(['A->C']);
  });

  it('two-hop uncertainty is sum of hop uncertainties and > single hop of either edge', () => {
    const r = convert({
      value: 10,
      fromUnit: 'g',
      toUnit: 'g',
      fromFormId: 'A',
      toFormId: 'C',
      forms,
      edges: [hop1, hop2], // no direct — only multi-hop
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBe(20);
    expect(r.uncertaintyPct).toBe(4 + 3);
    expect(r.uncertaintyPct).toBeGreaterThan(hop1.uncertaintyPct);
    expect(r.uncertaintyPct).toBeGreaterThan(hop2.uncertaintyPct);
    expect(r.path.length).toBe(2);
  });

  it('when both paths exist, shortest (1-hop) wins over multi-hop', () => {
    const r = convert({
      value: 10,
      fromUnit: 'g',
      toUnit: 'g',
      fromFormId: 'A',
      toFormId: 'C',
      forms,
      edges: [direct, hop1, hop2],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.path).toEqual(['A->C']);
    expect(r.uncertaintyPct).toBe(5);
    // multi-hop would be 7 — we correctly preferred shorter
    expect(r.uncertaintyPct).toBeLessThan(7);
  });
});

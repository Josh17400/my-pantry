/**
 * Spot-check known culinary conversions against seed densities / count weights.
 * Uses convert() from units — seed must not reimplement conversion math.
 */

import { describe, expect, it } from 'vitest';

import { seedForms, seedIngredients } from '../../src/seed';
import { convert } from '../../src/units';

function formById(id: string) {
  const f = seedForms.find((x) => x.id === id);
  if (!f) throw new Error(`missing form ${id}`);
  return f;
}

function expectIngredient(id: string) {
  const ing = seedIngredients.find((x) => x.id === id);
  if (!ing) throw new Error(`missing ingredient ${id}`);
  return ing;
}

describe('spot-check conversions (seed densities)', () => {
  it('1 cup granulated sugar ≈ 200 g', () => {
    expectIngredient('sugar-granulated');
    const form = formById('sugar-granulated-bulk');
    const r = convert({
      value: 1,
      fromUnit: 'cup',
      toUnit: 'g',
      form,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 200 g target; allow ±5%
    expect(r.value).toBeGreaterThan(190);
    expect(r.value).toBeLessThan(210);
  });

  it('1 cup all-purpose flour ≈ 120 g', () => {
    expectIngredient('flour-ap');
    const form = formById('flour-ap-bulk');
    const r = convert({
      value: 1,
      fromUnit: 'cup',
      toUnit: 'g',
      form,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeGreaterThan(110);
    expect(r.value).toBeLessThan(130);
  });

  it('1 large egg ≈ 50 g', () => {
    expectIngredient('egg');
    const form = formById('egg-whole');
    const r = convert({
      value: 1,
      fromUnit: 'each',
      toUnit: 'g',
      form,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(50, 5);
  });

  it('1 stick butter = 113 g (US 1/4 lb)', () => {
    expectIngredient('butter');
    const form = formById('butter-stick');
    const r = convert({
      value: 1,
      fromUnit: 'each',
      toUnit: 'g',
      form,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 113.398 g exact stick definition
    expect(r.value).toBeCloseTo(113.398, 2);
    expect(r.value).toBeGreaterThan(112);
    expect(r.value).toBeLessThan(114);
  });

  it('1 gallon whole milk has plausible mass via density', () => {
    const form = formById('milk-liquid');
    const r = convert({
      value: 1,
      fromUnit: 'gallon',
      toUnit: 'g',
      form,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 3785.41 ml * 1.03 ≈ 3900 g
    expect(r.value).toBeGreaterThan(3800);
    expect(r.value).toBeLessThan(4000);
  });

  it('1 cup olive oil ≈ 215 g at ~0.91 g/ml', () => {
    const form = formById('oil-olive-liquid');
    const r = convert({
      value: 1,
      fromUnit: 'cup',
      toUnit: 'g',
      form,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 236.588 * 0.91 ≈ 215
    expect(r.value).toBeGreaterThan(210);
    expect(r.value).toBeLessThan(220);
  });

  it('honey density is near USDA ~1.42 g/ml', () => {
    const form = formById('honey-bulk');
    expect(form.densityGPerMl).toBeDefined();
    expect(form.densityGPerMl!).toBeGreaterThan(1.35);
    expect(form.densityGPerMl!).toBeLessThan(1.5);
  });
});

describe('allergen tagging spot checks', () => {
  function allergensOf(id: string) {
    return expectIngredient(id).allergens;
  }

  it('soy sauce tags wheat and soy', () => {
    expect(allergensOf('soy-sauce')).toEqual(
      expect.arrayContaining(['wheat', 'soy']),
    );
  });

  it('Worcestershire tags fish', () => {
    expect(allergensOf('worcestershire')).toContain('fish');
  });

  it('chocolate chips tag milk and soy', () => {
    expect(allergensOf('chocolate-chips')).toEqual(
      expect.arrayContaining(['milk', 'soy']),
    );
  });

  it('flour-ap tags wheat', () => {
    expect(allergensOf('flour-ap')).toContain('wheat');
  });

  it('peanut butter tags peanut', () => {
    expect(allergensOf('peanut-butter')).toContain('peanut');
  });

  it('sesame oil tags sesame', () => {
    expect(allergensOf('oil-sesame')).toContain('sesame');
  });
});

describe('dietary flag / gluten gap', () => {
  function flagsOf(id: string) {
    return expectIngredient(id).dietaryFlags;
  }

  function allergensOf(id: string) {
    return expectIngredient(id).allergens;
  }

  it('barley is gluten-flagged and NOT faked as FALCPA wheat', () => {
    expect(flagsOf('barley')).toContain('gluten');
    expect(allergensOf('barley')).not.toContain('wheat');
  });

  it('rye is gluten-flagged without wheat allergen', () => {
    expect(flagsOf('rye')).toContain('gluten');
    expect(allergensOf('rye')).not.toContain('wheat');
  });

  it('wheat flour has wheat allergen and gluten flag', () => {
    expect(allergensOf('flour-ap')).toContain('wheat');
    expect(flagsOf('flour-ap')).toContain('gluten');
  });

  it('soy sauce has gluten (via wheat)', () => {
    expect(flagsOf('soy-sauce')).toContain('gluten');
  });

  it('conventional oats are gluten-flagged (cross-contamination)', () => {
    expect(flagsOf('oats-rolled')).toContain('gluten');
    expect(flagsOf('oats-steel-cut')).toContain('gluten');
  });

  it('malt extract is gluten-flagged without wheat allergen', () => {
    expect(flagsOf('malt-extract')).toContain('gluten');
    expect(allergensOf('malt-extract')).not.toContain('wheat');
  });

  it('spelt and farro are wheat + gluten', () => {
    expect(allergensOf('spelt')).toContain('wheat');
    expect(flagsOf('spelt')).toContain('gluten');
    expect(allergensOf('farro')).toContain('wheat');
    expect(flagsOf('farro')).toContain('gluten');
  });

  it('pork and beef meats carry dietary flags', () => {
    expect(flagsOf('bacon')).toContain('pork');
    expect(flagsOf('ground-beef')).toContain('beef');
  });
});

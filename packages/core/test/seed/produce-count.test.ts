/**
 * Produce classification: large items default to count; berries/grapes to mass;
 * bunch herbs carry high uncertainty; count↔mass round-trips via gramsPerCount.
 */

import { describe, expect, it } from 'vitest';

import type { IngredientForm } from '../../src/domain/types';
import { planCook } from '../../src/recipes';
import type { PantryStockRow, Recipe } from '../../src/recipes/types';
import {
  LB_G,
  seedCatalog,
  seedEdges,
  seedForms,
  seedIngredients,
  validateSeed,
} from '../../src/seed';
import { convert } from '../../src/units';

function formById(id: string): IngredientForm {
  const f = seedForms.find((x) => x.id === id);
  if (!f) throw new Error(`missing form ${id}`);
  return f;
}

function ingredientById(id: string) {
  const ing = seedIngredients.find((x) => x.id === id);
  if (!ing) throw new Error(`missing ingredient ${id}`);
  return ing;
}

function defaultForm(ingredientId: string): IngredientForm {
  const ing = ingredientById(ingredientId);
  return formById(ing.defaultFormId);
}

describe('produce count defaults (hand-sized produce)', () => {
  it.each([
    ['apple', 'count'],
    ['onion', 'count'],
    ['potato-russet', 'count'],
    ['lemon', 'count'],
    ['banana', 'count'],
    ['tomato', 'count'],
    ['avocado', 'count'],
    ['cucumber', 'count'],
    ['bell-pepper-green', 'count'],
    ['broccoli', 'count'],
    ['lettuce-romaine', 'count'],
  ] as const)('%s defaults to a %s form', (id, dim) => {
    const form = defaultForm(id);
    expect(form.dim).toBe(dim);
    expect(form.gramsPerCount).toBeDefined();
    expect(form.gramsPerCount!).toBeGreaterThan(0);
  });

  it.each(['blueberry', 'strawberry', 'grape', 'raspberry', 'blackberry', 'tomato-cherry'] as const)(
    '%s defaults to mass (scoop / clamshell produce)',
    (id) => {
      const form = defaultForm(id);
      expect(form.dim).toBe('mass');
    },
  );
});

describe('produce count ↔ mass round-trip', () => {
  it('5 lb potatoes → count → grams returns to ~5 lb within tolerance', () => {
    const whole = formById('potato-russet-whole');
    const bulk = formById('potato-russet-bulk');
    expect(whole.dim).toBe('count');
    expect(bulk.dim).toBe('mass');
    expect(whole.gramsPerCount).toBe(173);

    const fiveLbG = 5 * LB_G;

    // Mass → count via gramsPerCount on the count form
    const toCount = convert({
      value: fiveLbG,
      fromUnit: 'g',
      toUnit: 'each',
      form: whole,
    });
    expect(toCount.ok).toBe(true);
    if (!toCount.ok) return;
    // 5 lb / 173 g ≈ 13.1 potatoes
    expect(toCount.value).toBeGreaterThan(12);
    expect(toCount.value).toBeLessThan(14);

    // Count → grams and back toward 5 lb
    const backToG = convert({
      value: toCount.value,
      fromUnit: 'each',
      toUnit: 'g',
      form: whole,
    });
    expect(backToG.ok).toBe(true);
    if (!backToG.ok) return;
    expect(backToG.value).toBeCloseTo(fiveLbG, 5);

    // Graph path: whole (count) → bulk (mass) via seed edge
    const viaEdge = convert({
      value: 5,
      fromUnit: 'lb',
      toUnit: 'each',
      fromFormId: bulk.id,
      toFormId: whole.id,
      forms: [whole, bulk],
      edges: seedEdges.filter(
        (e) =>
          (e.fromFormId === whole.id && e.toFormId === bulk.id) ||
          (e.fromFormId === bulk.id && e.toFormId === whole.id),
      ),
    });
    expect(viaEdge.ok).toBe(true);
    if (!viaEdge.ok) return;
    expect(viaEdge.value).toBeCloseTo(toCount.value, 5);
  });

  it('2 potatoes → grams ≈ 346 g (2 × 173)', () => {
    const whole = formById('potato-russet-whole');
    const r = convert({
      value: 2,
      fromUnit: 'each',
      toUnit: 'g',
      form: whole,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toBeCloseTo(346, 5);
  });

  it('apples and onions expose mass bulk forms for receipt lb lines', () => {
    expect(seedForms.some((f) => f.id === 'apple-bulk' && f.dim === 'mass')).toBe(
      true,
    );
    expect(seedForms.some((f) => f.id === 'onion-bulk' && f.dim === 'mass')).toBe(
      true,
    );
    // Historical mass form ids for bagged potatoes remain
    expect(seedForms.some((f) => f.id === 'potato-russet-bulk')).toBe(true);
  });
});

describe('recipe line against weight-bought pantry stock', () => {
  it('2 potatoes (count) resolves against pantry holding potatoes by weight', () => {
    const whole = formById('potato-russet-whole');
    const bulk = formById('potato-russet-bulk');
    const fiveLbG = 5 * LB_G;

    const recipe: Recipe = {
      id: 'test-potato-recipe',
      title: 'Two potatoes',
      servings: 2,
      ingredients: [
        {
          ingredientId: 'potato-russet',
          formId: whole.id,
          rawText: '2 potatoes',
          qty: 2,
          unit: 'each',
          optional: false,
        },
      ],
      steps: [{ text: 'Cook the potatoes.' }],
      tags: [],
    };

    const pantry: PantryStockRow[] = [
      {
        ingredientId: 'potato-russet',
        formId: bulk.id,
        qtyBase: fiveLbG,
        dim: 'mass',
      },
    ];

    const plan = planCook(recipe, 2, pantry, {
      forms: seedForms,
      edges: seedEdges,
    });

    expect(plan.lines).toHaveLength(1);
    const line = plan.lines[0]!;
    expect(line.status).toBe('enough');
    expect(line.needBase).not.toBeNull();
    expect(line.haveBase).toBe(fiveLbG);
    expect(line.shortfallBase).toBe(0);
    // Need is in pantry form base (mass grams): 2 × 173
    expect(line.needBase).toBeCloseTo(346, 5);
  });
});

describe('bunch produce uncertainty', () => {
  it.each([
    'cilantro',
    'parsley-fresh',
    'mint-fresh',
    'kale',
    'celery',
    'basil-fresh',
  ] as const)('%s default bunch form has high uncertainty (≥50%)', (id) => {
    const form = defaultForm(id);
    expect(form.dim).toBe('count');
    expect(form.form).toBe('bunch');
    expect(form.uncertaintyPct).toBeGreaterThanOrEqual(50);
  });
});

describe('seed catalog still valid after produce reclassification', () => {
  it('validateSeed passes', () => {
    const result = validateSeed(seedCatalog);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      // Helpful on failure
      expect(result.issues).toEqual([]);
    }
  });
});

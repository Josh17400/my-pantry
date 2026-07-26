import { describe, expect, it } from 'vitest';

import { planCook } from '../../src/recipes';
import {
  ALL_FORMS,
  eggForm,
  flourForm,
  garlicClove,
  line,
  milkForm,
  recipe,
  stock,
} from './helpers';

const ctx = { forms: ALL_FORMS, edges: [] as const };

describe('planCook', () => {
  it('status enough when pantry covers need', () => {
    const r = recipe('r1', 'Pancakes', 2, [
      line({
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        rawText: '200 g flour',
        qty: 200,
        unit: 'g',
      }),
    ]);
    const pantry = [stock('ing-flour', flourForm.id, 500, 'mass')];
    const plan = planCook(r, 2, pantry, ctx);
    expect(plan.canCook).toBe(true);
    expect(plan.lines[0]!.status).toBe('enough');
    expect(plan.lines[0]!.needBase).toBe(200);
    expect(plan.lines[0]!.haveBase).toBe(500);
    expect(plan.lines[0]!.shortfallBase).toBe(0);
    expect(plan.lines[0]!.convertible).toBe(true);
    expect(plan.blockers).toHaveLength(0);
  });

  it('status short when pantry has some but not enough', () => {
    const r = recipe('r1', 'Bread', 1, [
      line({
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        rawText: '500 g flour',
        qty: 500,
        unit: 'g',
      }),
    ]);
    const pantry = [stock('ing-flour', flourForm.id, 200, 'mass')];
    const plan = planCook(r, 1, pantry, ctx);
    expect(plan.lines[0]!.status).toBe('short');
    expect(plan.lines[0]!.needBase).toBe(500);
    expect(plan.lines[0]!.haveBase).toBe(200);
    expect(plan.lines[0]!.shortfallBase).toBe(300);
    expect(plan.canCook).toBe(false);
    expect(plan.missingCount).toBe(1);
  });

  it('HEADLINE: unconvertible lines never silently become zero', () => {
    // Recipe wants garlic in cloves; pantry has minced with no edge path
    // and different dimension without usable bridge for the pair without edges
    // that we register. Use oil volume vs mass form mismatch on butter.
    const r = recipe('r1', 'Garlic thing', 1, [
      line({
        ingredientId: 'ing-garlic',
        formId: garlicClove.id,
        rawText: '3 cloves garlic',
        qty: 3,
        unit: 'each',
      }),
    ]);
    // Pantry stores garlic as minced volume only — conversion needs edges
    const pantry = [
      stock('ing-garlic', 'form-garlic-minced', 30, 'volume'),
    ];
    // Empty edges → no path clove(count) → minced(volume)
    const plan = planCook(r, 1, pantry, { forms: ALL_FORMS, edges: [] });
    const pl = plan.lines[0]!;
    expect(pl.status).toBe('not-convertible');
    expect(pl.convertible).toBe(false);
    // CRITICAL: shortfall must NOT be 0 and need/have must not pretend success
    expect(pl.shortfallBase).toBeNull();
    expect(pl.needBase).toBeNull();
    expect(pl.haveBase).toBeNull();
    expect(plan.canCook).toBe(false);
  });

  it('status not-in-pantry when ingredient absent', () => {
    const r = recipe('r1', 'Eggs only', 1, [
      line({
        ingredientId: 'ing-egg',
        formId: eggForm.id,
        rawText: '2 eggs',
        qty: 2,
        unit: 'each',
      }),
    ]);
    const plan = planCook(r, 1, [], ctx);
    expect(plan.lines[0]!.status).toBe('not-in-pantry');
    expect(plan.lines[0]!.shortfallBase).toBeNull();
    expect(plan.canCook).toBe(false);
  });

  it('optional missing does not block cook', () => {
    const r = recipe('r1', 'Toast', 1, [
      line({
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        rawText: '100 g flour',
        qty: 100,
        unit: 'g',
      }),
      line({
        ingredientId: 'ing-parmesan',
        formId: 'form-parmesan-grated',
        rawText: 'parmesan optional',
        qty: 20,
        unit: 'g',
        optional: true,
      }),
    ]);
    const pantry = [stock('ing-flour', flourForm.id, 200, 'mass')];
    const plan = planCook(r, 1, pantry, ctx);
    expect(plan.lines[1]!.status).toBe('optional-missing');
    expect(plan.canCook).toBe(true);
    expect(plan.blockers).toHaveLength(0);
  });

  it('non-quantified lines do not block or deduct', () => {
    const r = recipe('r1', 'Soup', 1, [
      line({
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        rawText: '50 g flour',
        qty: 50,
        unit: 'g',
      }),
      line({
        ingredientId: 'ing-salt',
        rawText: 'salt to taste',
        qty: null,
        unit: null,
        nonQuantified: true,
      }),
    ]);
    const pantry = [stock('ing-flour', flourForm.id, 100, 'mass')];
    const plan = planCook(r, 1, pantry, ctx);
    expect(plan.lines[1]!.status).toBe('non-quantified');
    expect(plan.lines[1]!.needBase).toBeNull();
    expect(plan.canCook).toBe(true);
  });

  it('substitution group satisfied when any member is enough', () => {
    const r = recipe('r1', 'Sauté', 1, [
      line({
        ingredientId: 'ing-butter',
        formId: 'form-butter',
        rawText: '2 tbsp butter',
        qty: 28, // ~2 tbsp butter in g if form is mass — use g directly
        unit: 'g',
        group: 'fat',
      }),
      line({
        ingredientId: 'ing-oil',
        formId: 'form-oil',
        rawText: '2 tbsp oil',
        qty: 30,
        unit: 'ml',
        group: 'fat',
      }),
    ]);
    // Only oil in pantry
    const pantry = [stock('ing-oil', 'form-oil', 100, 'volume')];
    const plan = planCook(r, 1, pantry, ctx);
    const butter = plan.lines[0]!;
    const oil = plan.lines[1]!;
    expect(oil.status).toBe('enough');
    expect(butter.status).toBe('not-in-pantry');
    expect(butter.groupSatisfied).toBe(true);
    expect(oil.groupSatisfied).toBe(true);
    expect(plan.canCook).toBe(true);
    expect(plan.blockers).toHaveLength(0);
    expect(plan.missingCount).toBe(0);
  });

  it('substitutes[]: alternative mass ingredient covers need', () => {
    // Omit formId so same-dim unit conversion works against the substitute's pantry row.
    const r2 = recipe('r2', 'Bake2', 1, [
      line({
        ingredientId: 'ing-butter',
        rawText: '50 g butter (or flour)',
        qty: 50,
        unit: 'g',
        substitutes: ['ing-flour'],
      }),
    ]);
    const pantry = [stock('ing-flour', flourForm.id, 200, 'mass')];
    const plan2 = planCook(r2, 1, pantry, ctx);
    expect(plan2.lines[0]!.status).toBe('enough');
    expect(plan2.lines[0]!.satisfiedByIngredientId).toBe('ing-flour');
    expect(plan2.canCook).toBe(true);
  });

  it('surfaces uncertaintyPct from conversion', () => {
    const r = recipe('r1', 'Milk bread', 1, [
      line({
        ingredientId: 'ing-milk',
        formId: milkForm.id,
        rawText: '1 cup milk',
        qty: 1,
        unit: 'cup',
      }),
    ]);
    // Pantry stores milk in ml (volume) — same dim pure unit conversion uncertainty 0
    const pantry = [stock('ing-milk', milkForm.id, 500, 'volume')];
    const plan = planCook(r, 1, pantry, ctx);
    expect(plan.lines[0]!.status).toBe('enough');
    expect(plan.lines[0]!.uncertaintyPct).toBe(0);
    expect(plan.lines[0]!.convertible).toBe(true);

    // Cross-dim: recipe in cup, compare to mass via density
    const rMass = recipe('r2', 'Milk mass', 1, [
      line({
        ingredientId: 'ing-milk',
        formId: milkForm.id,
        rawText: '1 cup milk',
        qty: 1,
        unit: 'cup',
      }),
    ]);
    // Force mass pantry row with same form (density bridge)
    const pantryMass = [stock('ing-milk', milkForm.id, 300, 'mass')];
    // form dim is volume but pantry says mass — convert cup→g via density
    const planMass = planCook(rMass, 1, pantryMass, ctx);
    // convert from cup to g with form density
    expect(planMass.lines[0]!.convertible).toBe(true);
    if (planMass.lines[0]!.convertible) {
      expect(planMass.lines[0]!.uncertaintyPct).toBe(5); // milk density uncertainty
    }
  });

  it('scales servings before comparing to pantry', () => {
    const r = recipe('r1', 'Pancakes', 4, [
      line({
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        rawText: '400 g flour',
        qty: 400,
        unit: 'g',
      }),
    ]);
    // Half recipe → 200 g need; have 200 → enough
    const pantry = [stock('ing-flour', flourForm.id, 200, 'mass')];
    const plan = planCook(r, 2, pantry, ctx);
    expect(plan.servings).toBe(2);
    expect(plan.lines[0]!.needBase).toBe(200);
    expect(plan.lines[0]!.status).toBe('enough');
  });

  it('uses range high for need/shortfall quantity', () => {
    const r = recipe('r1', 'Garlic', 1, [
      line({
        ingredientId: 'ing-garlic',
        formId: garlicClove.id,
        rawText: '2-4 cloves',
        qty: 3,
        unit: 'each',
        qtyLow: 2,
        qtyHigh: 4,
        isRange: true,
      }),
    ]);
    const pantry = [stock('ing-garlic', garlicClove.id, 3, 'count')];
    const plan = planCook(r, 1, pantry, ctx);
    // Need high=4, have=3 → short by 1
    expect(plan.lines[0]!.needBase).toBe(4);
    expect(plan.lines[0]!.status).toBe('short');
    expect(plan.lines[0]!.shortfallBase).toBe(1);
  });

  it('nothing writes transactions — plan is a pure value', () => {
    const r = recipe('r1', 'X', 1, [
      line({
        ingredientId: 'ing-flour',
        formId: flourForm.id,
        rawText: '10 g',
        qty: 10,
        unit: 'g',
      }),
    ]);
    const pantry = [stock('ing-flour', flourForm.id, 10, 'mass')];
    const a = planCook(r, 1, pantry, ctx);
    const b = planCook(r, 1, pantry, ctx);
    expect(a).toEqual(b);
    expect(pantry[0]!.qtyBase).toBe(10); // unchanged
  });
});

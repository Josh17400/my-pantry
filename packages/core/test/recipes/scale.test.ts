import { describe, expect, it } from 'vitest';

import { isFractionalCount, isNonQuantifiedLine, scaleRecipe } from '../../src/recipes';
import { line, recipe } from './helpers';

describe('scaleRecipe', () => {
  it('scales every quantified line by target / servings', () => {
    const r = recipe('r1', 'Pancakes', 4, [
      line({
        ingredientId: 'ing-flour',
        formId: 'form-flour-ap',
        rawText: '2 cups flour',
        qty: 2,
        unit: 'cup',
      }),
      line({
        ingredientId: 'ing-egg',
        formId: 'form-egg-whole',
        rawText: '2 eggs',
        qty: 2,
        unit: 'each',
      }),
    ]);

    const scaled = scaleRecipe(r, 2); // half
    expect(scaled.servings).toBe(2);
    expect(scaled.originalServings).toBe(4);
    expect(scaled.ingredients[0]!.qty).toBe(1);
    expect(scaled.ingredients[0]!.scaleFactor).toBe(0.5);
    expect(scaled.ingredients[1]!.qty).toBe(1);
  });

  it('flags fractional counts without rounding (2.5 eggs)', () => {
    const r = recipe('r1', 'Omelette', 2, [
      line({
        ingredientId: 'ing-egg',
        formId: 'form-egg-whole',
        rawText: '5 eggs',
        qty: 5,
        unit: 'each',
      }),
    ]);

    // 5 eggs for 2 → scale to 1 serving = 2.5 eggs
    const scaled = scaleRecipe(r, 1);
    expect(scaled.ingredients[0]!.qty).toBe(2.5);
    expect(scaled.ingredients[0]!.fractionalCount).toBe(true);
    // Must NOT be rounded to 2 or 3
    expect(scaled.ingredients[0]!.qty).not.toBe(2);
    expect(scaled.ingredients[0]!.qty).not.toBe(3);
  });

  it('does not flag whole counts as fractional', () => {
    const r = recipe('r1', 'Eggs', 2, [
      line({
        ingredientId: 'ing-egg',
        formId: 'form-egg-whole',
        rawText: '4 eggs',
        qty: 4,
        unit: 'each',
      }),
    ]);
    const scaled = scaleRecipe(r, 1);
    expect(scaled.ingredients[0]!.qty).toBe(2);
    expect(scaled.ingredients[0]!.fractionalCount).toBe(false);
  });

  it('passes non-quantified lines through unscaled', () => {
    const r = recipe('r1', 'Soup', 4, [
      line({
        ingredientId: 'ing-salt',
        rawText: 'salt to taste',
        qty: null,
        unit: null,
        nonQuantified: true,
      }),
      line({
        ingredientId: 'ing-pepper',
        rawText: 'a pinch of pepper',
        qty: null,
        unit: null,
      }),
      line({
        ingredientId: 'ing-flour',
        formId: 'form-flour-ap',
        rawText: '100 g flour',
        qty: 100,
        unit: 'g',
      }),
    ]);

    const scaled = scaleRecipe(r, 8); // 2×
    expect(scaled.ingredients[0]!.qty).toBeNull();
    expect(scaled.ingredients[0]!.scaleFactor).toBe(1);
    expect(scaled.ingredients[0]!.fractionalCount).toBe(false);
    expect(scaled.ingredients[1]!.qty).toBeNull();
    expect(scaled.ingredients[1]!.scaleFactor).toBe(1);
    expect(scaled.ingredients[2]!.qty).toBe(200);
    expect(scaled.ingredients[2]!.scaleFactor).toBe(2);
  });

  it('scales range high/low with the same factor', () => {
    const r = recipe('r1', 'Garlic bread', 2, [
      line({
        ingredientId: 'ing-garlic',
        formId: 'form-garlic-clove',
        rawText: '2-3 cloves',
        qty: 2.5,
        unit: 'each',
        qtyLow: 2,
        qtyHigh: 3,
        isRange: true,
      }),
    ]);
    const scaled = scaleRecipe(r, 4);
    expect(scaled.ingredients[0]!.qty).toBe(5);
    expect(scaled.ingredients[0]!.qtyLow).toBe(4);
    expect(scaled.ingredients[0]!.qtyHigh).toBe(6);
    expect(scaled.ingredients[0]!.isRange).toBe(true);
  });

  it('isNonQuantifiedLine detects null qty/unit', () => {
    expect(
      isNonQuantifiedLine({
        rawText: 'to taste',
        qty: null,
        unit: null,
      }),
    ).toBe(true);
    expect(
      isNonQuantifiedLine({
        rawText: '1 cup',
        qty: 1,
        unit: 'cup',
      }),
    ).toBe(false);
  });

  it('isFractionalCount for count units only', () => {
    expect(isFractionalCount('each', 2.5)).toBe(true);
    expect(isFractionalCount('each', 2)).toBe(false);
    expect(isFractionalCount('g', 2.5)).toBe(false);
    expect(isFractionalCount('eggs', 1.5)).toBe(true);
  });
});

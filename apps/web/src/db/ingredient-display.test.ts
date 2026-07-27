import { describe, expect, it } from 'vitest';

import {
  isUsableIngredientTitle,
  resolveIngredientTitle,
  seedIngredientName,
} from './ingredient-display';

describe('ingredient-display', () => {
  it('seed catalog knows cucumber', () => {
    expect(seedIngredientName('cucumber')).toBe('Cucumber');
  });

  it('rejects raw ids and location labels as titles', () => {
    expect(isUsableIngredientTitle('cucumber', 'cucumber', null)).toBe(false);
    expect(isUsableIngredientTitle('Fridge', 'cucumber', 'Fridge')).toBe(false);
    expect(isUsableIngredientTitle('Cucumber', 'cucumber', 'Fridge')).toBe(true);
  });

  it('a pantry row whose ingredient is missing from the local catalogue still resolves a usable title', () => {
    // Simulate domain join miss: name fell back to the raw id.
    const title = resolveIngredientTitle({
      ingredientId: 'cucumber',
      ingredientName: 'cucumber',
      locationName: 'Fridge',
    });
    expect(title).toBe('Cucumber');
  });

  it('uses a denormalized write-time name when seed is also unknown', () => {
    const title = resolveIngredientTitle({
      ingredientId: 'custom-homegrown-thing',
      ingredientName: 'Homegrown thing',
      locationName: null,
    });
    expect(title).toBe('Homegrown thing');
  });
});

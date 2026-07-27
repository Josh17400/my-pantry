import { describe, expect, it } from 'vitest';

import { resolvePantryItemDisplayName } from './PantryItemRow';

describe('resolvePantryItemDisplayName', () => {
  it('uses a real catalog name', () => {
    expect(
      resolvePantryItemDisplayName({
        ingredientName: 'Whole milk',
        ingredientId: 'milk',
        locationName: 'Fridge',
      }),
    ).toBe('Whole milk');
  });

  it('falls back to the seed catalog when the join returns a location name', () => {
    // Domain join mishap / stale row: name equals location.
    // Seed still knows milk → usable title.
    const title = resolvePantryItemDisplayName({
      ingredientName: 'Fridge',
      ingredientId: 'milk',
      locationName: 'Fridge',
    });
    expect(title).not.toBe('Unknown item');
    expect(title).not.toBe('Fridge');
    expect(title.toLowerCase()).toContain('milk');
  });

  it('falls back to the seed catalog when the domain fell back to the raw id', () => {
    // ingredient missing from local ingredients table → join used ingredientId
    expect(
      resolvePantryItemDisplayName({
        ingredientName: 'spinach',
        ingredientId: 'spinach',
        locationName: null,
      }),
    ).toBe('Spinach (fresh)');
  });

  it('falls back to seed when name is empty but id is a known seed ingredient', () => {
    expect(
      resolvePantryItemDisplayName({
        ingredientName: '  ',
        ingredientId: 'cucumber',
        locationName: 'Fridge',
      }),
    ).toBe('Cucumber');
  });

  it('still returns Unknown item when every source fails', () => {
    expect(
      resolvePantryItemDisplayName({
        ingredientName: 'not-a-real-ingredient-zzz',
        ingredientId: 'not-a-real-ingredient-zzz',
        locationName: 'Pantry',
      }),
    ).toBe('Unknown item');
  });

  it('rejects uuid-shaped titles that are not seed ids', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    expect(
      resolvePantryItemDisplayName({
        ingredientName: uuid,
        ingredientId: uuid,
        locationName: null,
      }),
    ).toBe('Unknown item');
  });
});

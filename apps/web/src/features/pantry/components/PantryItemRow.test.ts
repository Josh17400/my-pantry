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

  it('never shows a location name as the title', () => {
    expect(
      resolvePantryItemDisplayName({
        ingredientName: 'Fridge',
        ingredientId: 'milk',
        locationName: 'Fridge',
      }),
    ).toBe('Unknown item');
  });

  it('never shows a raw ingredient id as the title', () => {
    expect(
      resolvePantryItemDisplayName({
        ingredientName: 'all-purpose-flour',
        ingredientId: 'all-purpose-flour',
        locationName: 'Pantry',
      }),
    ).toBe('Unknown item');
  });

  it('rejects when the domain fell back to ingredientId', () => {
    expect(
      resolvePantryItemDisplayName({
        ingredientName: 'spinach',
        ingredientId: 'spinach',
        locationName: null,
      }),
    ).toBe('Unknown item');
  });

  it('rejects uuid-shaped titles', () => {
    expect(
      resolvePantryItemDisplayName({
        ingredientName: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        ingredientId: 'milk',
        locationName: null,
      }),
    ).toBe('Unknown item');
  });

  it('uses Unknown item when name is empty', () => {
    expect(
      resolvePantryItemDisplayName({
        ingredientName: '  ',
        ingredientId: 'milk',
        locationName: 'Fridge',
      }),
    ).toBe('Unknown item');
  });
});

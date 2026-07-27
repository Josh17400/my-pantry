/**
 * Mine / Browse shelf + search helpers — would have caught "only 4 fixtures" UI.
 */

import { describe, expect, it } from 'vitest';

import type { RecipeDetail, RecipeSummary } from '../../db/types';
import {
  filterByShelf,
  filterCanMake,
  searchRecipes,
  shelfOf,
} from './shelf';

function summary(
  over: Partial<RecipeSummary> & Pick<RecipeSummary, 'id' | 'title'>,
): RecipeSummary {
  return {
    householdId: null,
    servings: 2,
    prepMin: 5,
    cookMin: 10,
    visibility: 'public',
    authorId: 'good-pantry',
    tags: ['catalog'],
    imageUrl: null,
    updatedAt: '2026-07-01T00:00:00.000Z',
    source: 'catalog',
    ...over,
  };
}

function detail(
  over: Partial<RecipeDetail> & Pick<RecipeDetail, 'id' | 'title'>,
): RecipeDetail {
  return {
    householdId: null,
    servings: 2,
    prepMin: 5,
    cookMin: 10,
    visibility: 'public',
    authorId: 'good-pantry',
    tags: ['catalog'],
    imageUrl: null,
    updatedAt: '2026-07-01T00:00:00.000Z',
    source: 'catalog',
    yieldNote: null,
    forkedFrom: null,
    createdAt: '2026-07-01T00:00:00.000Z',
    ingredients: [],
    steps: [],
    ...over,
  };
}

describe('shelfOf / filterByShelf', () => {
  const catalog = summary({
    id: 'recipe-spinach-scramble',
    title: 'Spinach Scramble',
    source: 'catalog',
    householdId: null,
  });
  const mine = summary({
    id: 'user-1',
    title: 'My Chili',
    source: 'user',
    householdId: 'local-household',
    authorId: 'local-user',
    tags: [],
    visibility: 'private',
  });

  it('classifies catalogue vs user recipes', () => {
    expect(shelfOf(catalog)).toBe('browse');
    expect(shelfOf(mine)).toBe('mine');
  });

  it('Browse shelf returns catalogue only', () => {
    const browse = filterByShelf([catalog, mine], 'browse');
    expect(browse).toHaveLength(1);
    expect(browse[0]!.id).toBe(catalog.id);
  });

  it('Mine shelf returns user book only', () => {
    const mineList = filterByShelf([catalog, mine], 'mine');
    expect(mineList).toHaveLength(1);
    expect(mineList[0]!.id).toBe(mine.id);
  });

  it('Browse with 50 catalogue rows yields more than 10 cards', () => {
    const fifty = Array.from({ length: 50 }, (_, i) =>
      summary({
        id: `recipe-n-${i}`,
        title: `Recipe ${i}`,
        source: 'catalog',
      }),
    );
    const browse = filterByShelf([...fifty, mine], 'browse');
    expect(browse.length).toBeGreaterThan(10);
    expect(browse).toHaveLength(50);
  });
});

describe('searchRecipes', () => {
  const chicken = summary({
    id: 'r-chicken',
    title: 'Simple Chicken & Rice',
    source: 'user',
    householdId: 'hh',
    authorId: 'u',
    tags: [],
  });
  const pasta = summary({
    id: 'r-pasta',
    title: 'Garlic Pasta',
    source: 'user',
    householdId: 'hh',
    authorId: 'u',
    tags: [],
  });
  const details: RecipeDetail[] = [
    detail({
      id: 'r-chicken',
      title: 'Simple Chicken & Rice',
      source: 'user',
      householdId: 'hh',
      authorId: 'u',
      tags: [],
      ingredients: [
        {
          id: 'l1',
          sortOrder: 0,
          rawText: '1 lb chicken breast',
          ingredientId: 'chicken-breast',
          qty: 454,
          unit: 'g',
        },
        {
          id: 'l2',
          sortOrder: 1,
          rawText: '1.5 cups rice',
          ingredientId: 'rice-white',
          qty: 280,
          unit: 'g',
        },
      ],
    }),
    detail({
      id: 'r-pasta',
      title: 'Garlic Pasta',
      source: 'user',
      householdId: 'hh',
      authorId: 'u',
      tags: [],
      ingredients: [
        {
          id: 'l3',
          sortOrder: 0,
          rawText: 'spaghetti',
          ingredientId: 'pasta-spaghetti',
          qty: 340,
          unit: 'g',
        },
      ],
    }),
  ];

  it('matches title', () => {
    const hit = searchRecipes([chicken, pasta], 'garlic', details);
    expect(hit.map((r) => r.id)).toEqual(['r-pasta']);
  });

  it('matches ingredient name (chicken and rice)', () => {
    const hit = searchRecipes([chicken, pasta], 'chicken', details);
    expect(hit.map((r) => r.id)).toEqual(['r-chicken']);
    const rice = searchRecipes([chicken, pasta], 'rice', details);
    expect(rice.map((r) => r.id)).toEqual(['r-chicken']);
  });
});

describe('filterCanMake', () => {
  const a = summary({ id: 'a', title: 'A', source: 'user', householdId: 'h' });
  const b = summary({ id: 'b', title: 'B', source: 'user', householdId: 'h' });

  it('passes all through in all mode', () => {
    expect(filterCanMake([a, b], new Set(['a']), 'all')).toHaveLength(2);
  });

  it('filters to cookable ids', () => {
    const hit = filterCanMake([a, b], new Set(['b']), 'can-make');
    expect(hit.map((r) => r.id)).toEqual(['b']);
  });
});

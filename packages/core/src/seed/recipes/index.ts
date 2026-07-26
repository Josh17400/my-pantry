/**
 * Starter recipe catalog (~50 original household recipes).
 *
 * Ingredient lines reference seed catalog ids/forms only.
 * All step prose and titles are original to The Good Pantry — not scraped or adapted
 * from copyrighted recipe sites.
 */

import { breakfastRecipes } from './breakfast';
import { dessertRecipes } from './desserts';
import { onePanRecipes } from './one-pan';
import { pastaRecipes } from './pasta';
import { saladBowlRecipes } from './salads-bowls';
import { sideRecipes } from './sides';
import { soupRecipes } from './soups';
import { weekendRecipes } from './weekend';
import { weeknightRecipes } from './weeknight';
import type { Recipe } from '../../recipes/types';

export { qty, taste, step, recipe } from './helpers';
export type { RecipeDef } from './helpers';

export {
  breakfastRecipes,
  pastaRecipes,
  weeknightRecipes,
  onePanRecipes,
  soupRecipes,
  saladBowlRecipes,
  sideRecipes,
  weekendRecipes,
  dessertRecipes,
};

/** Ordered category bundles (stable for diffs / reports). */
export const STARTER_RECIPE_CATEGORIES = [
  { id: 'breakfast', label: 'Breakfast', recipes: breakfastRecipes },
  { id: 'pasta', label: 'Pasta', recipes: pastaRecipes },
  { id: 'weeknight', label: 'Weeknight dinners', recipes: weeknightRecipes },
  { id: 'one-pan', label: 'One-pan & sheet-pan', recipes: onePanRecipes },
  { id: 'soups', label: 'Soups', recipes: soupRecipes },
  { id: 'salads-bowls', label: 'Salads & grain bowls', recipes: saladBowlRecipes },
  { id: 'sides', label: 'Sides', recipes: sideRecipes },
  { id: 'weekend', label: 'Weekend', recipes: weekendRecipes },
  { id: 'desserts', label: 'Desserts', recipes: dessertRecipes },
] as const;

/**
 * Full starter catalog: flat list of all public seed recipes.
 * Deterministic order follows STARTER_RECIPE_CATEGORIES.
 */
export const starterRecipes: readonly Recipe[] = STARTER_RECIPE_CATEGORIES.flatMap(
  (c) => c.recipes,
);

/** Lookup by id. */
export function getStarterRecipe(id: string): Recipe | undefined {
  return starterRecipes.find((r) => r.id === id);
}

export function countStarterRecipes(): number {
  return starterRecipes.length;
}

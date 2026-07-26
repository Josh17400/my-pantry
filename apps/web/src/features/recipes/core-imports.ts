/**
 * Core recipe / grocery modules are not yet on the @larder/core root barrel
 * (architect owns re-exports). Import module paths the same way seed does.
 */

export {
  sourcesFromPlanShortfalls,
} from '../../../../../packages/core/src/grocery/sources.ts';
export type { GrocerySource } from '../../../../../packages/core/src/grocery/types.ts';
export {
  findCookableRecipes,
  planCook,
  scaleRecipe,
} from '../../../../../packages/core/src/recipes/index.ts';
export type {
  ConversionContext,
  CookableMatch,
  CookLineStatus,
  CookPlan,
  CookPlanLine,
  PantryStockRow,
  Recipe,
  RecipeLine,
  RecipeStep,
  ScaledRecipe,
  ScaledRecipeLine,
} from '../../../../../packages/core/src/recipes/types.ts';
export {
  seedEdges,
  seedForms,
  seedIngredients,
} from '../../../../../packages/core/src/seed/index.ts';

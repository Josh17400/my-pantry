/**
 * @larder/core/recipes — scaling, cook planning, cook-now matching.
 *
 * Pure TypeScript. Zero React, zero platform APIs, zero I/O.
 * planCook never writes transactions — committing is the caller's job.
 *
 * Root barrel (`src/index.ts`) is owned by the architect — do not edit it.
 */

export {
  collectUseUp,
  findCookableRecipes,
  parseNowMs,
} from './cookable';
export {
  indexPantryByIngredient,
  needQtyFromLine,
  planCook,
} from './plan';
export {
  isFractionalCount,
  isNonQuantifiedLine,
  scaleRecipe,
} from './scale';
export type {
  ConversionContext,
  CookableMatch,
  CookLineStatus,
  CookPlan,
  CookPlanLine,
  FindCookableOptions,
  PantryStockRow,
  Recipe,
  RecipeLine,
  RecipeStep,
  RecipeVisibility,
  ScaledRecipe,
  ScaledRecipeLine,
  UseUpIngredient,
} from './types';

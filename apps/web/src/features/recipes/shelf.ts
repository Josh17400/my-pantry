/**
 * Mine vs Browse shelf helpers for the Recipes screen.
 * Catalogue recipes are system-seeded (source: catalog); Mine is household-owned.
 */

import { isCatalogRecipe, recipeSource } from '../../db/seed-recipes';
import type { RecipeDetail, RecipeSummary } from '../../db/types';

export type RecipeShelf = 'mine' | 'browse';

export type RecipeFilterMode = 'all' | 'can-make';

export function shelfOf(recipe: {
  householdId?: string | null;
  authorId?: string | null;
  tags?: readonly string[] | null;
  source?: 'catalog' | 'user';
}): RecipeShelf {
  if (recipe.source === 'catalog') return 'browse';
  if (recipe.source === 'user') return 'mine';
  return isCatalogRecipe(recipe) ? 'browse' : 'mine';
}

/** Filter the list to the active shelf (Mine = user book, Browse = catalogue). */
export function filterByShelf<T extends RecipeSummary>(
  recipes: readonly T[],
  shelf: RecipeShelf,
): T[] {
  return recipes.filter((r) => shelfOf(r) === shelf);
}

/** Search within a set by title or ingredient line text / id. */
export function searchRecipes(
  recipes: readonly RecipeSummary[],
  query: string,
  details: readonly RecipeDetail[],
): RecipeSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...recipes];

  const detailById = new Map(details.map((d) => [d.id, d]));
  return recipes.filter((r) => {
    if (r.title.toLowerCase().includes(q)) return true;
    const d = detailById.get(r.id);
    if (!d) return false;
    return d.ingredients.some(
      (line) =>
        line.rawText.toLowerCase().includes(q) ||
        (line.ingredientId?.toLowerCase().includes(q) ?? false),
    );
  });
}

/** Apply can-make-now filter using a set of cookable recipe ids. */
export function filterCanMake(
  recipes: readonly RecipeSummary[],
  cookableIds: ReadonlySet<string>,
  mode: RecipeFilterMode,
): RecipeSummary[] {
  if (mode !== 'can-make') return [...recipes];
  return recipes.filter((r) => cookableIds.has(r.id));
}

export { isCatalogRecipe, recipeSource };

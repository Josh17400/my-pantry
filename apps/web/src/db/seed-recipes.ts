/**
 * Map core starter recipes → app RecipeWrite and seed them idempotently.
 *
 * Catalogue recipes are system-authored (no household), tagged for Browse,
 * and never clobber user-created rows (different id space + ownership check).
 */

import { countStarterRecipes, starterRecipes } from '@larder/core';

import type { RecipeDetail, RecipeWrite } from './types';

/** Core starter recipe row (inferred so we need no extra barrel type export). */
type CoreStarterRecipe = (typeof starterRecipes)[number];

/** Minimal port — DomainRepository and DevDomainRepository both satisfy this. */
export type RecipeSeedPort = {
  getRecipe(id: string): Promise<RecipeDetail | null>;
  createRecipe(input: RecipeWrite): Promise<RecipeDetail>;
  updateRecipe(id: string, input: RecipeWrite): Promise<RecipeDetail | null>;
};

/** Tag + author markers for catalogue-sourced recipes (Mine/Browse split). */
export const CATALOG_AUTHOR_ID = 'good-pantry' as const;
export const CATALOG_TAG = 'catalog' as const;

export type RecipeSource = 'catalog' | 'user';

/** True when a stored recipe is from the starter catalogue (not user-owned). */
export function isCatalogRecipe(recipe: {
  householdId?: string | null;
  authorId?: string | null;
  tags?: readonly string[] | null;
}): boolean {
  if (recipe.tags?.includes(CATALOG_TAG)) return true;
  return (
    (recipe.householdId == null || recipe.householdId === '') &&
    recipe.authorId === CATALOG_AUTHOR_ID
  );
}

/** Derive source for list filtering / UI. */
export function recipeSource(recipe: {
  householdId?: string | null;
  authorId?: string | null;
  tags?: readonly string[] | null;
}): RecipeSource {
  return isCatalogRecipe(recipe) ? 'catalog' : 'user';
}

function withCatalogTag(tags: readonly string[] | undefined): string[] {
  const base = tags ? [...tags] : [];
  if (!base.includes(CATALOG_TAG)) base.push(CATALOG_TAG);
  return base;
}

/** Convert a core starter Recipe into a persistable write (catalogue-sourced). */
export function starterRecipeToWrite(recipe: CoreStarterRecipe): RecipeWrite {
  return {
    id: recipe.id,
    householdId: null,
    title: recipe.title,
    servings: recipe.servings,
    yieldNote: recipe.yieldNote ?? null,
    prepMin: recipe.prepMin ?? null,
    cookMin: recipe.cookMin ?? null,
    authorId: recipe.authorId ?? CATALOG_AUTHOR_ID,
    visibility: recipe.visibility ?? 'public',
    forkedFrom: recipe.forkedFrom ?? null,
    tags: withCatalogTag(recipe.tags),
    imageUrl: recipe.imageUrl ?? null,
    ingredients: recipe.ingredients.map((line) => ({
      ingredientId: line.ingredientId,
      formId: line.formId,
      rawText: line.rawText,
      qty: line.qty,
      unit: line.unit,
      optional: line.optional,
      group: line.group,
      substitutes: line.substitutes,
      unknownAllergens: line.unknownAllergens,
      nonQuantified: line.nonQuantified,
      qtyHigh: line.qtyHigh,
      qtyLow: line.qtyLow,
      isRange: line.isRange,
    })),
    steps: recipe.steps.map((s) => ({
      text: s.text,
      durationSec: s.durationSec,
      timerLabel: s.timerLabel,
    })),
  };
}

export type SeedRecipesResult = {
  recipesUpserted: number;
  recipesSkipped: number;
  catalogSize: number;
};

/**
 * Upsert starter catalogue recipes. Idempotent by id.
 * Only updates rows that are still catalogue-owned (never overwrites a
 * user-owned row if ids ever collided).
 */
export async function seedStarterRecipes(
  domain: RecipeSeedPort,
): Promise<SeedRecipesResult> {
  const catalogSize = countStarterRecipes();
  let recipesUpserted = 0;
  let recipesSkipped = 0;

  for (const starter of starterRecipes) {
    const write = starterRecipeToWrite(starter);
    const id = write.id!;
    const existing: RecipeDetail | null = await domain.getRecipe(id);

    if (existing) {
      if (!isCatalogRecipe(existing)) {
        // User (or other) owns this id — leave it alone.
        recipesSkipped += 1;
        continue;
      }
      await domain.updateRecipe(id, write);
      recipesUpserted += 1;
    } else {
      await domain.createRecipe(write);
      recipesUpserted += 1;
    }
  }

  return { recipesUpserted, recipesSkipped, catalogSize };
}

export function starterCatalogSize(): number {
  return countStarterRecipes();
}

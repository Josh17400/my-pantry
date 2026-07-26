/**
 * Build a MatchCatalog from our seed data for barcode → ingredient matching.
 * OFF products are never added to this catalog.
 */

import type { Ingredient } from '@larder/core';

import {
  seedForms,
  seedIngredients,
} from '../../../../../packages/core/src/seed/index.ts';
import type {
  IngredientAlias,
  MatchCatalog,
} from '../../../../../packages/core/src/matching/types.ts';

/** Canonical ingredients only — no OFF-sourced rows. */
export function buildSeedMatchCatalog(
  userAliases: readonly IngredientAlias[] = [],
): MatchCatalog {
  const ingredients: Ingredient[] = seedIngredients.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    allergens: s.allergens,
    dietaryFlags: s.dietaryFlags,
    isStaple: s.isStaple,
    defaultFormId: s.defaultFormId,
  }));

  const globalAliases: IngredientAlias[] = [];
  for (const s of seedIngredients) {
    for (const alias of s.aliases) {
      globalAliases.push({
        alias,
        ingredientId: s.id,
        scope: 'global',
      });
    }
  }

  return {
    ingredients,
    taxonomyParentByIngredientId: {},
    globalAliases,
    userAliases,
  };
}

export function defaultFormIdForIngredient(ingredientId: string): string | null {
  const ing = seedIngredients.find((i) => i.id === ingredientId);
  if (ing) return ing.defaultFormId;
  const form = seedForms.find((f) => f.ingredientId === ingredientId);
  return form?.id ?? null;
}

export function catalogIngredientIds(): ReadonlySet<string> {
  return new Set(seedIngredients.map((i) => i.id));
}

export function getCatalogIngredientName(id: string): string {
  return seedIngredients.find((i) => i.id === id)?.name ?? id;
}

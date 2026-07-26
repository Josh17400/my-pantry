/**
 * Seed match catalog for community / import ingredient resolution.
 */

import type { Ingredient } from '@larder/core';

import {
  seedIngredients,
  type IngredientAlias,
  type MatchCatalog,
  type SeedIngredient,
} from './core-imports';

function toIngredient(s: SeedIngredient): Ingredient {
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    allergens: s.allergens,
    dietaryFlags: s.dietaryFlags,
    isStaple: s.isStaple,
    defaultFormId: s.defaultFormId,
  };
}

export function buildGlobalAliases(
  ingredients: readonly SeedIngredient[] = seedIngredients,
): IngredientAlias[] {
  const aliases: IngredientAlias[] = [];
  for (const ing of ingredients) {
    for (const a of ing.aliases) {
      aliases.push({
        alias: a,
        ingredientId: ing.id,
        scope: 'global',
      });
    }
    aliases.push({
      alias: ing.name,
      ingredientId: ing.id,
      scope: 'global',
    });
  }
  return aliases;
}

export function buildCommunityMatchCatalog(
  userAliases: readonly IngredientAlias[] = [],
  options: { householdId?: string } = {},
): MatchCatalog {
  return {
    ingredients: seedIngredients.map(toIngredient),
    taxonomyParentByIngredientId: {},
    globalAliases: buildGlobalAliases(),
    userAliases: userAliases.map((a) =>
      a.scope === 'user'
        ? {
            ...a,
            householdId: a.householdId ?? options.householdId,
          }
        : a,
    ),
  };
}

export function getDefaultFormId(ingredientId: string): string | undefined {
  return seedIngredients.find((i) => i.id === ingredientId)?.defaultFormId;
}

export function getIngredientName(ingredientId: string): string | undefined {
  return seedIngredients.find((i) => i.id === ingredientId)?.name;
}

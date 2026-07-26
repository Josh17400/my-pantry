/**
 * Build a MatchCatalog from seed + learned user aliases for receipt matching.
 */

import type { Ingredient } from '@larder/core';

import {
  seedForms,
  seedIngredients,
  seedPackages,
  type IngredientAlias,
  type MatchCatalog,
  type SeedIngredient,
} from './core-imports';
import type { PackageChoice } from './types';

/** Humanize package labels like "can_14_5oz" → "14.5 oz can". */
export function displayPackageLabel(label: string, netG: number): string {
  const ozMatch = label.match(/(\d+(?:[._]\d+)?)\s*oz/i);
  if (ozMatch) {
    const oz = ozMatch[1]!.replace('_', '.');
    return `${oz} oz`;
  }
  const lbMatch = label.match(/(\d+(?:[._]\d+)?)\s*lb/i);
  if (lbMatch) {
    const lb = lbMatch[1]!.replace('_', '.');
    return `${lb} lb`;
  }
  // fallback: show approximate oz from grams
  const oz = Math.round((netG / 28.349523125) * 10) / 10;
  if (oz >= 1) return `${oz} oz`;
  return label.replace(/_/g, ' ');
}

export function packagesForIngredient(ingredientId: string): PackageChoice[] {
  const formIds = new Set(
    seedForms.filter((f) => f.ingredientId === ingredientId).map((f) => f.id),
  );
  const out: PackageChoice[] = [];
  for (const p of seedPackages) {
    if (!formIds.has(p.formId)) continue;
    out.push({
      label: p.label,
      netG: p.netG,
      formId: p.formId,
      displayLabel: displayPackageLabel(p.label, p.netG),
    });
  }
  return out;
}

function toIngredient(s: SeedIngredient): Ingredient {
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    allergens: s.allergens,
    isStaple: s.isStaple,
    defaultFormId: s.defaultFormId,
  };
}

/** Global aliases from seed ingredient.aliases. */
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
    // name itself as global alias for exact path
    aliases.push({
      alias: ing.name,
      ingredientId: ing.id,
      scope: 'global',
    });
  }
  return aliases;
}

export function buildMatchCatalog(
  userAliases: readonly IngredientAlias[] = [],
  options: {
    householdId?: string;
  } = {},
): MatchCatalog {
  const ingredients = seedIngredients.map(toIngredient);
  return {
    ingredients,
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

export function getIngredientCategory(ingredientId: string): string | undefined {
  return seedIngredients.find((i) => i.id === ingredientId)?.category;
}

export function getDefaultFormId(ingredientId: string): string | undefined {
  return seedIngredients.find((i) => i.id === ingredientId)?.defaultFormId;
}

export function getIngredientName(ingredientId: string): string | undefined {
  return seedIngredients.find((i) => i.id === ingredientId)?.name;
}

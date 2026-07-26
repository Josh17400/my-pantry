/**
 * Catalog helpers for cook planning + ingredient picker.
 * Uses seed forms/edges as the conversion graph (same ids as DB seed).
 */

import type { IngredientForm } from '@larder/core';

import type { ConversionContext } from './core-imports';
import {
  seedEdges,
  seedForms,
  seedIngredients,
} from './core-imports';

/** Conversion context for planCook / findCookableRecipes. */
export function catalogConversionContext(): ConversionContext {
  return {
    forms: seedForms as readonly IngredientForm[],
    edges: seedEdges,
  };
}

export type CatalogIngredient = {
  id: string;
  name: string;
  category: string;
  defaultFormId: string;
  allergens: readonly string[];
};

const byId = new Map(seedIngredients.map((i) => [i.id, i]));

export function getIngredientName(id: string | undefined | null): string {
  if (!id) return '';
  return byId.get(id)?.name ?? id;
}

export function getIngredientCategory(id: string | undefined | null): string {
  if (!id) return 'Other';
  return byId.get(id)?.category ?? 'Other';
}

export function searchCatalogIngredients(
  query: string,
  limit = 12,
): CatalogIngredient[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return seedIngredients.slice(0, limit).map((i) => ({
      id: i.id,
      name: i.name,
      category: i.category,
      defaultFormId: i.defaultFormId,
      allergens: i.allergens,
    }));
  }

  const scored: { score: number; item: CatalogIngredient }[] = [];
  for (const i of seedIngredients) {
    const name = i.name.toLowerCase();
    const aliasHit = i.aliases.some((a) => a.toLowerCase().includes(q));
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 50;
    else if (aliasHit) score = 40;
    else continue;
    scored.push({
      score,
      item: {
        id: i.id,
        name: i.name,
        category: i.category,
        defaultFormId: i.defaultFormId,
        allergens: i.allergens,
      },
    });
  }
  scored.sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  return scored.slice(0, limit).map((s) => s.item);
}

export function defaultFormForIngredient(
  ingredientId: string,
): IngredientForm | undefined {
  const ing = byId.get(ingredientId);
  if (!ing) return undefined;
  return seedForms.find((f) => f.id === ing.defaultFormId);
}

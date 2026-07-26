/**
 * Search the seeded ingredient catalog (in-memory from core seed).
 * Domain repository has no listIngredients API; seed is the catalog source.
 */

import type { Dimension, IngredientForm } from '@larder/core';
import {
  seedForms,
  seedIngredients,
  type SeedIngredient,
} from '../../../../../../packages/core/src/seed/index.ts';

export type CatalogIngredient = {
  id: string;
  name: string;
  category: string;
  defaultFormId: string;
  isStaple: boolean;
  forms: CatalogForm[];
};

export type CatalogForm = {
  id: string;
  ingredientId: string;
  form: string;
  dim: Dimension;
};

function mapForm(f: IngredientForm): CatalogForm {
  return {
    id: f.id,
    ingredientId: f.ingredientId,
    form: f.form,
    dim: f.dim,
  };
}

const formsByIngredient = (() => {
  const map = new Map<string, CatalogForm[]>();
  for (const f of seedForms) {
    const list = map.get(f.ingredientId) ?? [];
    list.push(mapForm(f));
    map.set(f.ingredientId, list);
  }
  return map;
})();

function toCatalog(ing: SeedIngredient): CatalogIngredient {
  return {
    id: ing.id,
    name: ing.name,
    category: ing.category,
    defaultFormId: ing.defaultFormId,
    isStaple: ing.isStaple,
    forms: formsByIngredient.get(ing.id) ?? [],
  };
}

/** Case-insensitive name / alias / id search. Caps results for UI. */
export function searchCatalog(
  query: string,
  limit = 40,
): CatalogIngredient[] {
  const q = query.trim().toLowerCase();
  if (q.length < 1) {
    return seedIngredients.slice(0, limit).map(toCatalog);
  }

  const scored: Array<{ score: number; ing: SeedIngredient }> = [];
  for (const ing of seedIngredients) {
    const name = ing.name.toLowerCase();
    const id = ing.id.toLowerCase();
    let score = -1;
    if (name === q || id === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (name.includes(q) || id.includes(q)) score = 2;
    else if (ing.aliases.some((a) => a.toLowerCase().includes(q))) score = 3;
    if (score >= 0) scored.push({ score, ing });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.ing.name.localeCompare(b.ing.name);
  });

  return scored.slice(0, limit).map((s) => toCatalog(s.ing));
}

export function getCatalogIngredient(
  id: string,
): CatalogIngredient | null {
  const ing = seedIngredients.find((i) => i.id === id);
  return ing ? toCatalog(ing) : null;
}

export function catalogSize(): number {
  return seedIngredients.length;
}
